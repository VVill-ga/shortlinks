import {Database} from "bun:sqlite";

const db = new Database("links.db");

function createRedirect(body){
  let code = body.requestedCode;
  if(code){
    console.log("Creating: ", body.requestedCode)
    db.query("INSERT INTO links (code, link) VALUES (?1, ?2)").run(body.requestedCode, body.link);
  }
  else{
    do{
      code = ""
      for(let i = 0; i < 3; i++)
        code += String.fromCharCode(Math.floor(Math.random() * 26)+65)
    }while(db.query("SELECT link FROM links WHERE code=?").get(code) || Bun.file('/'+code).size || Bun.file('/'+code+'/index.html').size)
    db.query("INSERT INTO links (code, link) VALUES (?1, ?2)").run(code, body.link);
  }

  return new Response(code, {status: 200});
}

const server = Bun.serve({
  port: process.env.SHORTLINKS_PORT || 80,
  async fetch(req) {
    switch(req.method){
      case "GET":
        let filepath = "public" + new URL(req.url).pathname;
        if(filepath.slice(-1) == "/")
          filepath += "index.html";
        const file = Bun.file(filepath);
        if(file.size) // Invalid paths create a file with size 0
          return new Response(file);
        else{
          const sqlResult = db.query("SELECT link FROM links WHERE code=?").get(new URL(req.url).pathname.slice(1));
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
  },
});

db.query("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, link TEXT)").run();

console.log(`Server running on port ${server.port}`);
