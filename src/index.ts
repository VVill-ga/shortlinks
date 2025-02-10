import yaml from "yaml";
import {Database} from "bun:sqlite";

import { attemptLogin, checkPassword, initAuth } from "./auth";
import { initCodesFile } from "./codes";
import { followLink, postRedirect } from "./links";

type config = {
  port: number,
  rootURL: string,
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
  cf_ipcity TEXT DEFAULT NULL
  PRIMARY KEY (timestamp, ip)
)`).run();
initAuth();
initCodesFile();

const server = Bun.serve({
  port: Number(ctx.config.port) || 8008,
  async fetch(req): Promise<Response> {
    switch(req.method){
      case "GET":
        let filepath = "./public" + new URL(req.url).pathname;
        if(filepath.slice(-1) == "/")
          filepath += "index.html";
        const file = Bun.file(filepath);
        if(file.size) // Invalid paths create a file with size 0
          return new Response(file);
        else
          return followLink(req);

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
    }
    return new Response(null, {status: 404});
  },
});


console.log(`Server running on port ${server.port}`);
