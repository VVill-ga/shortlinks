import {Database} from "bun:sqlite";
import { initAuth } from "./auth";
const db = new Database("./database/links.db");
const codesFile = Bun.file("./database/codes.3.txt");
let codes: number[]

type dbRow = {code: string, link: string}
db.query("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, link TEXT)").run();
initAuth(db);

/**
 * Converts an index to a 3 letter code
 * @param {number} index 
 * @returns A 3 letter code
 */
function indexToCombination(index: number): string {
  const firstChar = String.fromCharCode(65 + Math.floor(index / (26 * 26)) % 26);
  const secondChar = String.fromCharCode(65 + Math.floor(index / 26) % 26);
  const thirdChar = String.fromCharCode(65 + index % 26);
  return `${firstChar}${secondChar}${thirdChar}`;
}

/**
 * Convert a 3 letter code to its corresponding index.
 * 
 * @param combination - The three-letter combination (e.g., "AAA", "ZZZ").
 * @returns The index of the combination in the range [0, 17575].
 */
function combinationToIndex(combination: string): number {
  const firstCharIndex = combination.charCodeAt(0) - 65; // 'A' -> 0, 'Z' -> 25
  const secondCharIndex = combination.charCodeAt(1) - 65;
  const thirdCharIndex = combination.charCodeAt(2) - 65;
  return firstCharIndex * 26 * 26 + secondCharIndex * 26 + thirdCharIndex;
}

/**
 * Initialize the codes file
 */
function initCodes() {
  codes = Array.from({ length: 26**3 }, (_, i) => i);
  codes.sort(() => Math.random() - 0.5);
  const writer = codesFile.writer();
  for (const i of codes) {
    const combination = indexToCombination(i);
    writer.write(combination);
  }
  writer.flush()
}

/**
 * Initialize codes from file
 */
async function readCodesFromFile() {
  for(let i = 0; i <= codesFile.size - 1; i += 3) {
    const str = await codesFile.slice(i, i+3).text()
    codes.push(combinationToIndex(str))
  }
}

if(!await codesFile.exists())
  initCodes();
else
  readCodesFromFile();

/**
 * Random Shortlink Path Generator
 * @returns String - A random 3 letter code
 */
function generateCode(): string {
  const i = codes.shift()
  if(i){
    const code = indexToCombination(i)
    Bun.write(codesFile, codesFile.slice(3)) //Promise unawaited
    return code;
  }
  return ""; //Figure out error case here. DB Full! Out of codes!
}

/**
 * Creates a redirect in the database
 * 
 * @param {{link: string, requestedCode: string}} body 
 * @param {string} body.link - The link to be redirected to
 * @param {string} body.requestedCode - The path to be directed to the link
 * 
 * @returns 
 */
function createRedirect({link, requestedCode=undefined}: {link: string, requestedCode?: string}): Response {
  let code = requestedCode || generateCode();
  db.query("INSERT INTO links (code, link) VALUES (?1, ?2)").run(code, link);
  return new Response(code, {status: 200});
}

const server = Bun.serve({
  port: Number(process.env.SHORTLINKS_PORT) || 80,
  async fetch(req): Promise<Response> {
    switch(req.method){
      case "GET":
        let filepath = "public" + new URL(req.url).pathname;
        if(filepath.slice(-1) == "/")
          filepath += "index.html";
        const file = Bun.file(filepath);
        if(file.size) // Invalid paths create a file with size 0
          return new Response(file);
        else{
          const sqlResult = db.query("SELECT link FROM links WHERE code=?").get(new URL(req.url).pathname.slice(1)) as dbRow;
          if(sqlResult && sqlResult.link)
            return new Response(null, {headers: {Location: sqlResult.link}, status: 302});
          else
            return new Response(null,  {status: 404});
        }
        break;

      case "POST":
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
          const checkFolder = Bun.file("public/" + data.requestedCode + "index.html");
          const checkFile = Bun.file("public/" + data.requestedCode);
          const checkSQL = db.query("SELECT link FROM links WHERE code=?").get(data.requestedCode);
          if(checkFolder.size || checkFile.size || checkSQL)
            return new Response("Requested path denied. Path exists.", {status: 409})
        }
        return createRedirect(data);
        break;
    }
    return new Response(null, {status: 404});
  },
});


console.log(`Server running on port ${server.port}`);
