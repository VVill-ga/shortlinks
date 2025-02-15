import yaml from "yaml";
import {Database} from "bun:sqlite";

import { attemptLogin, checkPassword, initAuth, verifyToken } from "./auth";
import { initCodesFile } from "./codes";
import { followLink, postRedirect } from "./links";

type config = {
    port: number,
    rootURL: string,
    requireLogin: boolean,
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
        switch(req.method){
            case "GET":
                // Publicly Available
                switch(new URL(req.url).pathname){
                    case "/favicon.ico":
                        return new Response(Bun.file("./public/favicon.ico"));
                    case "/favicon.svg":
                        return new Response(Bun.file("./public/favicon.svg"));
                    case "/modal.js":
                        return new Response(Bun.file("./public/modal.js"));
                    case "/login":
                        return new Response(Bun.file("./public/login.html"));
                    default:
                        let redirect = followLink(req);
                        if(redirect != null) return redirect;
                }
                // Everything else requires Auth if logins are required
                if(ctx.config.requireLogin && (!req.headers.get("Authorization") || !verifyToken(req.headers.get("Authorization")?.split(" ")[1] || "")))
                    return new Response(null, {headers: {Location: "/login"}, status: 302});
                // Auth'd paths
                switch(new URL(req.url).pathname){
                    case "/":
                        return new Response(Bun.file("./public/index.html"));
                }
                return new Response(Bun.file("./public/404.html"), {status: 404});

            case "POST":
                switch(new URL(req.url).pathname){
                    case "/checklogin":
                        return await checkPassword(req);
                    case "/login":
                        return await attemptLogin(req);
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
