import { generateCode } from "./codes";
import { isAdmin, isAuthenticated } from "./auth";
import { ctx } from "./index";

type dbRow = {
    code: string,
    link: string,
    creator: string,
    created: number,
    expires: number | null,
    visits: number,
    maxVisits: number | null
}

type postRedirectBody = {
    link: string,
    requestedCode?: string,
    maxVisits?: number,
    expires?: number
}

// Paths that are served as part of the web interface
const reservedPaths = [
    "login",
    "manage",
    "accounts",
]

/**
 * Creates a redirect in the database
 * 
 * @param {postRedirectBody} body - Contains info for creating redirect
 * 
 * @returns 
 */
async function createRedirect(req: Request, body: postRedirectBody): Promise<Response> {
    let code = body.requestedCode || await generateCode();
    ctx.db.query("INSERT INTO links (code, link, creator, maxVisits, expires) VALUES (?1, ?2, ?3, ?4, ?5)").run(
        code,
        body.link,
        ctx.config.requireLogin ? isAuthenticated(req) || "" : "",
        body.maxVisits || null,
        body.expires || null
    );
    return new Response("https://" + ctx.config.domain + "/" + code, {status: 201});
}

/**
 * Parses a request to create a redirect
 * 
 * @param req HTTP Request contianing the destination link and requested path
 * @returns HTTP Response
 */
export async function postRedirect(req: Request): Promise<Response> {
    if(ctx.config.requireLogin && !isAuthenticated(req))
        return new Response("Unauthenticated", {status: 401});
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
        const checkSQL = ctx.db.query("SELECT link FROM links WHERE code=?").get(data.requestedCode);
        if(checkSQL || reservedPaths.includes(data.requestedCode))
            return new Response("Requested path denied. Path exists.", {status: 409})
    }
    if(data.maxVisits && data.maxVisits < 1){
        return new Response("maxVisits must be at least 1", {status: 400});
    }
    if(data.expires && data.expires < Date.now()){
        return new Response("Expires must be a timestamp in the future", {status: 400});
    }
    return createRedirect(req, data);
}

/**
 * Deletes a redirect from the database
 * 
 * @param req HTTP Request to delete a redirect
 * @returns HTTP Response
 */
export async function deleteRedirect(req: Request): Promise<Response> {
    const code = new URL(req.url).pathname.split("/")[2];
    const redirect = ctx.db.query("SELECT * FROM links WHERE code=?").get(code) as dbRow;
    if(!redirect)
        return new Response("Redirect not found", {status: 404});
    if(!isAdmin(isAuthenticated(req) || "") && redirect.creator !== isAuthenticated(req))
        return new Response("Unauthorized", {status: 403});
    ctx.db.query("DELETE FROM links WHERE code=?").run(code);
    return new Response(null, {status: 200});
}

/**
 * Modifies a redirect in the database
 * 
 * @param req HTTP Request to modify a redirect
 * @returns HTTP Response    
 */
export async function modifyRedirect(req: Request): Promise<Response> {
    const code = new URL(req.url).pathname.split("/")[2];
    const redirect = ctx.db.query("SELECT * FROM links WHERE code=?").get(code) as dbRow;
    if(!redirect)
        return new Response("Redirect not found", {status: 404});
    if(!isAdmin(isAuthenticated(req) || "") && redirect.creator !== isAuthenticated(req))
        return new Response("Unauthorized", {status: 403});
    const body = await req.formData()
    const link = body.get("link") as string;
    if(!link)
        return new Response("Missing new destination link", {status: 400});
    ctx.db.query("UPDATE links SET link=? WHERE code=?").run(link, code);
    return new Response(`<tr id="link-${code}">
        <td><a href="https://${ctx.config.domain}/${code}">${code}</a></td>
        <td style="line-break: anywhere;">${link}</td>
        <td>${redirect.visits}</td>
        <td>${redirect.expires ? new Date(redirect.expires * 1000).toLocaleString() : "Never"}</td>
        <td nowrap>
            <u aria-controls="edit-modal" onclick="toggleEditModal(event)" data-link="/${code}" data-url="${link}">Edit</u>
            <span class="separator">|</span>
            <u aria-controls="delete-modal" onclick="toggleDeleteModal(event)" data-link="/${code}" data-url="${link}">Delete</u>
        </td>
    </tr>`, {status: 200});
}

/**
 * Attempts to follow a redirect in the database
 * 
 * @param req HTTP Request looking for a redirect
 * @returns Response, redirects or an error
 */
export function followLink(req: Request): Response | null {
    const code = new URL(req.url).pathname.slice(1);
    const link = ctx.db.query("SELECT * FROM links WHERE code=?").get(code) as dbRow;
    if(!link || !link.link)
        null
    if((link.maxVisits && link.visits >= link.maxVisits) || 
        (link.expires && link.expires < Date.now())){
        ctx.db.query("DELETE FROM links WHERE code=?").run(code);
        return new Response(null, {status: 410});
    }
    ctx.db.query("UPDATE links SET visits=visits+1 WHERE code=?").run(code);
    if(ctx.config.analytics.enabled){
        ctx.db.query(`INSERT INTO analytics 
            (code, ip, useragent, referer, cf_ipcountry, cf_ipcity)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).run(
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

export function getLinks(user: string, page: number): dbRow[] {
    if(isAdmin(user))
        return ctx.db.query("SELECT * FROM links ORDER BY created DESC LIMIT ?1 OFFSET ?2").all(5, page * 5) as dbRow[];
    return ctx.db.query("SELECT * FROM links WHERE creator=? ORDER BY created DESC LIMIT ?1 OFFSET ?2").all(5, page * 5, user) as dbRow[];
}

export function getCount(user: string): number {
    if(isAdmin(user))
        return ctx.db.query("SELECT COUNT(*) FROM links").get() as number;
    return ctx.db.query("SELECT COUNT(*) FROM links WHERE creator=?").get(user) as number;
}