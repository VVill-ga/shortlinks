import { generateCode } from "./codes";
import { verifyToken } from "./auth";
import { ctx } from "./index";

type dbRow = {
    code: string,
    link: string,
    visits: number,
    created: number,
    maxVisits: number | null,
    expires: number | null
}

type postRedirectBody = {
    link: string,
    requestedCode?: string,
    maxVisits?: number,
    expires?: number
}

/**
 * Creates a redirect in the database
 * 
 * @param {postRedirectBody} body - Contains info for creating redirect
 * 
 * @returns 
 */
async function createRedirect(body: postRedirectBody): Promise<Response> {
    let code = body.requestedCode || await generateCode();
    ctx.db.query("INSERT INTO links (code, link, maxVisits, expires) VALUES (?1, ?2, ?3, ?4)").run(
        code,
        body.link,
        body.maxVisits || null,
        body.expires || null
    );
    return new Response(ctx.config.rootURL + code, {status: 201});
}

/**
 * Parses a request to create a redirect
 * 
 * @param req HTTP Request contianing the destination link and requested path
 * @returns HTTP Response
 */
export async function postRedirect(req: Request): Promise<Response> {
    const token = req.headers.get("Authorization")?.split(" ")[1];
    if(!token)
        return new Response("Unauthenticated", {status: 401});
    if(!verifyToken(token))
        return new Response("Unautherized", {status: 401});
    let data: postRedirectBody;
    try{
        data = await req.json() as postRedirectBody;
    } catch(err){
        return new Response("Error parsing body", {status: 400});
    }
    if(!data.link)
        return new Response("Missing destination link", {status: 400});
    if(data.requestedCode){
        console.log("Recieved request for : ", data.requestedCode)
        if(!data.requestedCode.match(/^([0-9]|[a-z])+([0-9a-z]+)$/i))
        return new Response("Requested path denied. Either non alphanumeric characters were used or the length was less than 2.", {status: 409})
        const checkFolder = Bun.file("./public/" + data.requestedCode + "index.html");
        const checkFile = Bun.file("./public/" + data.requestedCode);
        const checkSQL = ctx.db.query("SELECT link FROM links WHERE code=?").get(data.requestedCode);
        if(checkFolder.size || checkFile.size || checkSQL)
            return new Response("Requested path denied. Path exists.", {status: 409})
    }
    if(data.maxVisits && data.maxVisits < 1){
        return new Response("maxVisits must be at least 1", {status: 400});
    }
    if(data.expires && data.expires < Date.now()){
        return new Response("Expires must be a timestamp in the future", {status: 400});
    }
    return createRedirect(data);
}

/**
 * Attempts to follow a redirect in the database
 * 
 * @param req HTTP Request looking for a redirect
 * @returns Response, redirects or an error
 */
export async function followLink(req: Request): Promise<Response> {
    const code = new URL(req.url).pathname.slice(1);
    const link = ctx.db.query("SELECT * FROM links WHERE code=?").get(code) as dbRow;
    if(!link || !link.link)
        return new Response(null, {status: 404});
    if((link.maxVisits && link.visits >= link.maxVisits) || 
        (link.expires && link.expires < Date.now())){
        ctx.db.query("DELETE FROM links WHERE code=?").run(code);
        return new Response(null, {status: 410});
    }
    ctx.db.query("UPDATE links SET visits=visits+1 WHERE code=?").run(code);
    if(ctx.config.analytics.enabled){
        ctx.db.query("INSERT INTO analytics (code, ip, useragent, referer, cf_ipcountry, cf_ipcity) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").run(
            code,
            ctx.config.analytics.ip? 
                req.headers.get("X-Forwarded-For") || req.headers.get("X-Real-IP") || "unknown" : null,
            ctx.config.analytics.useragent?
                req.headers.get("User-Agent") || "unknown" : null,
            ctx.config.analytics.referer?
                req.referrer || "unknown" : null,
            ctx.config.analytics.cf_ipcountry?
                req.headers.get("CF-IPCountry") || "unknown" : null,
            ctx.config.analytics.cf_ipcity?
                req.headers.get("CF-IPCity") || "unknown" : null
        );
    }
    return new Response(null, {headers: {Location: link.link}, status: 302});
}