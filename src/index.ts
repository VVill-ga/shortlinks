import {Database} from "bun:sqlite";
import { attemptLogin, checkPassword, initAuth } from "./auth";
import { initCodesFile } from "./codes";
import { postRedirect } from "./links";
const db = new Database("./database/links.db");

type dbRow = {code: string, link: string}
db.query("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, link TEXT)").run();
initAuth(db);
initCodesFile();


const server = Bun.serve({
  port: Number(process.env.SHORTLINKS_PORT) || 8008,
  async fetch(req): Promise<Response> {
    switch(req.method){
      case "GET":
        let filepath = "./public" + new URL(req.url).pathname;
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

      case "POST":
        switch(new URL(req.url).pathname){
          case "/checklogin":
            return await checkPassword(req, db);
          case "/login":
            return await attemptLogin(req, db);
          case "/":
            return await postRedirect(req, db);
          default:
            return new Response("Invalid endpoint", {status: 404});
        }
    }
    return new Response(null, {status: 404});
  },
});


console.log(`Server running on port ${server.port}`);
