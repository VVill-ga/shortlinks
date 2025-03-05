import yaml from "yaml";
import {Database} from "bun:sqlite";

import { attemptLogin, checkPassword, initAuth, isAdmin, isAuthenticated, logoutUser } from "./auth";
import { initCodesFile } from "./codes";
import { followLink, postRedirect } from "./links";
import routes from "./htmx";

type config = {
    port: number,
    domain: string,
    requireLogin: boolean,
    sessionLifetime: number,
    analytics: {
        enabled: boolean,
        ip: boolean,
        useragent: boolean,
        referer: boolean,
        cf_ipcountry: boolean,
        cf_ipcity: boolean
    }
}

export const ctx = {
    db: new Database("./database/shortlinks.db"),
    config: yaml.parse(await Bun.file("config.yaml").text()) as config
}

const authRequired = [
    "/", "/index.html",
    "/x/index.html",
    "/links", "/links/index.html",
    "/x/links.html",
]
const adminRequired = [
    "/accounts", "/accounts/index.html",
    "/x/accounts.html",
]

ctx.db.query(`CREATE TABLE IF NOT EXISTS links (
    code TEXT PRIMARY KEY, 
    link TEXT, 
    visits INTEGER DEFAULT 0, 
    created INTEGER DEFAULT (strftime('%s', 'now')),
    maxVisits INTEGER DEFAULT NULL, 
    expires INTEGER DEFAULT NULL
)`).run();

ctx.db.query(`CREATE TABLE IF NOT EXISTS analytics (
    code TEXT,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    ip TEXT DEFAULT NULL,
    useragent TEXT DEFAULT NULL,
    referer TEXT DEFAULT NULL,
    cf_ipcountry TEXT DEFAULT NULL,
    cf_ipcity TEXT DEFAULT NULL,
    PRIMARY KEY (timestamp, ip)
)`).run();
initAuth();
initCodesFile();

const server = Bun.serve({
    port: Number(ctx.config.port) || 8008,
    async fetch(req): Promise<Response> {
        let path = new URL(req.url).pathname;
        switch(req.method){
            case "GET":
                // Static file hosting. Omitting paths that require auth if requireLogin is set
                if(!authRequired.includes(path) && !adminRequired.includes(path)) {
                    let file = Bun.file("./public" + path);
                    let index = Bun.file("./public" + path + "/index.html");
                    if(await file.exists()) return new Response(file);
                    if(await index.exists()) return new Response(index);
                    let redirect = followLink(req);
                    if(redirect != null) return redirect;
                    return new Response(Bun.file("./public/404.html"), {status: 404});
                }
                // Everything else requires Auth if logins are required
                if(ctx.config.requireLogin && !isAuthenticated(req)){
                    if(authRequired.includes(path))
                        return new Response(null, {headers: {Location: "/login.html"}, status: 302});
                    return new Response("Authentication required", {status: 401});
                }
                if(adminRequired.includes(path) && !isAdmin(isAuthenticated(req) || "")){
                    return new Response("This page requires admin access", {status: 401});
                }
                // Auth'd paths
                switch(new URL(req.url).pathname){
                    // Define paths that require dynamic content
                    case "/":
                    case "/index.html":
                        return new Response(routes.index(req), {headers: { "Content-Type": "text/html" }});
                    case "/links":
                    case "/links/index.html":
                        return new Response(routes.links(req), {headers: { "Content-Type": "text/html" }});
                    case "/accounts":
                    case "/accounts/index.html":
                        return new Response(routes.accounts(req), {headers: { "Content-Type": "text/html" }});
                    default:
                        let file = Bun.file("./public" + path);
                        let index = Bun.file("./public" + path + "/index.html");
                        if(await file.exists()) return new Response(file);
                        if(await index.exists()) return new Response(index);
                }
                return new Response(Bun.file("./public/404.html"), {status: 404});

            case "POST":
                switch(path){
                    case "/checklogin":
                        return await checkPassword(req);
                    case "/login":
                        return await attemptLogin(req);
                    case "/logout":
                        logoutUser(isAuthenticated(req) || "");
                        return new Response(null, {status: 200});
                    case "/":
                        return await postRedirect(req);
                    default:
                        return new Response("Invalid endpoint", {status: 404});
                }
            default:
                return new Response("Invalid endpoint", {status: 405});
        }
    },
});


console.log(`Server running on port ${server.port}`);
