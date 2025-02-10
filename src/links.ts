import {Database} from "bun:sqlite";
import { generateCode } from "./codes";
import { verifyToken } from "./auth";

type dbRow = {
    code: string,
    link: string,
    visits: number,
    created: number,
    maxVisits: number | null,
    expires: number | null
}

/**
 * Creates a redirect in the database
 * 
 * @param {string} link - The link to be redirected to
 * @param {Database} db - The database
 * @param {string} requestedCode - The path to be directed to the link
 * 
 * @returns 
 */
export function createRedirect(link: string, db: Database, requestedCode?: string): Response {
  let code = requestedCode || generateCode();
  db.query("INSERT INTO links (code, link) VALUES (?1, ?2)").run(code, link);
  return new Response(code, {status: 201});
}

/**
 * Parses a request to create a redirect
 * 
 * @param req HTTP Request contianing the destination link and requested path
 * @param db Reference to the database
 * @returns HTTP Response
 */
export async function postRedirect(req: Request, db: Database): Promise<Response> {
    const token = req.headers.get("Authorization")?.split(" ")[1];
    if(!token)
        return new Response("Unauthenticated", {status: 401});
    if(!verifyToken(token))
        return new Response("Unautherized", {status: 401});
    let data;
    try{
        data = await req.json();
    } catch(err){
        return new Response("Error parsing JSON body", {status: 400});
    }
    if(!data.link)
        return new Response("Missing destination link", {status: 400});
    if(data.requestedCode){
        console.log("Recieved request for : ", data.requestedCode)
        if(!data.requestedCode.match(/^([0-9]|[a-z])+([0-9a-z]+)$/i))
        return new Response("Requested path denied. Either non alphanumeric characters were used or the length was less than 2.", {status: 409})
        const checkFolder = Bun.file("./public/" + data.requestedCode + "index.html");
        const checkFile = Bun.file("./public/" + data.requestedCode);
        const checkSQL = db.query("SELECT link FROM links WHERE code=?").get(data.requestedCode);
        if(checkFolder.size || checkFile.size || checkSQL)
        return new Response("Requested path denied. Path exists.", {status: 409})
    }
    return createRedirect(data.link, db, data.requestedCode);
}

export async function followLink(req: Request, db: Database): Promise<Response> {
    const code = new URL(req.url).pathname.slice(1);
    const link = db.query("SELECT link FROM links WHERE code=?").get(code) as dbRow;
    if(!link || !link.link)
        return new Response(null, {status: 404});
    return new Response(null, {headers: {Location: link.link}, status: 302});
}