import yaml from "yaml";
import {Database} from "bun:sqlite";

import { attemptLogin, checkPassword, initAuth } from "./auth";
import { initCodesFile } from "./codes";
import { followLink, postRedirect } from "./links";

const db = new Database("./database/shortlinks.db");
const config = yaml.parse(await Bun.file("config.yaml").text());

db.query(`CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY, 
  link TEXT, 
  visits INTEGER DEFAULT 0, 
  created INTEGER DEFAULT (strftime('%s', 'now')),
  maxVisits INTEGER DEFAULT NULL, 
  expires INTEGER DEFAULT NULL
)`).run();
initAuth(db);
initCodesFile();

const server = Bun.serve({
  port: Number(config.port) || 8008,
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
          return followLink(req, db);
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
