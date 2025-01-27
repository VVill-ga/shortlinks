import {Database} from "bun:sqlite";
import { generateCode } from "./codes";

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
  return new Response(code, {status: 200});
}