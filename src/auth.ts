import {Database} from "bun:sqlite";
import * as OTPAuth from "otpauth";
import qrcode from "qrcode";
const defaultUsername = "admin";
const defaultPassword = "password";

let tokens: {name: string, token: string, expires: Date}[] = []

type User = {
    name: string,
    password: string,
    secret: string,
    admin: boolean
}

export function initAuth(db: Database){
    db.query("CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, password TEXT, secret TEXT, admin BOOLEAN)").run();

    // Create an admin user if there are no users
    const users = db.query("SELECT 1 FROM users").get();
    if(users) {
        console.log("Existing users found. Skipping admin creation."); 
        return;
    }
    const secret = new OTPAuth.Secret();
    db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, true)").run(defaultUsername, defaultPassword, secret.base32);
    
    const authURI = OTPAuth.URI.stringify(new OTPAuth.TOTP({
        issuer: "shortlinks",
        label: defaultUsername,
        secret: secret,
    }))

    // Export the admin secret to a file
    Bun.write(Bun.file("./temp/admin.secret"), authURI);

    // Export the admin secret to a qr code image file
    qrcode.toFile("./temp/admin.secret.png", authURI);

    // Print the admin secret qr code to the console
    qrcode.toString(authURI, {type:'terminal', small: true}, function (err, url) {
        console.log("\nAdmin account created. Secret URL and QR code available in ./temp\n");
        console.log("You can also scan here: \n")
        console.log(authURI + "\n");
        console.log(url);
    })
}

export function createUser(name: string, password: string, admin: boolean, db: Database): string {
    const exists = db.query("SELECT * FROM users WHERE name=?").get(name);
    if(exists) return "";
    const secret = new OTPAuth.Secret();
    db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, ?4)").run(name, password, secret.base32, admin);
    return secret.base32;
}

export async function attemptLogin(req: Request, db: Database){
    let data = await req.json();
    if(!data.username || !data.password || !data.otp)
        return new Response("Missing username, password, or OTP", {status: 400});
    const token = loginUser(data.username, data.password, data.otp, db);
    if(!token)
        return new Response("Invalid username, password, or OTP", {status: 401});
    return new Response(JSON.stringify({token}), {status: 200});
}

export function loginUser(name: string, password: string, otp: string, db: Database){
    const user = db.query("SELECT * FROM users WHERE name=?").get(name) as User;
    if(!user) return false;
    if(user.password !== password) return false;
    let totp = new OTPAuth.TOTP({
        issuer: "shortlinks",
        label: name,
        secret: OTPAuth.Secret.fromBase32(user.secret)
    });
    if(totp.validate({token: otp}) == null) return false;
    return createToken(name);
}

function createToken(name: string): string{
    const token = crypto.randomUUID();
    const expires = new Date();
    // Tokens last 24 hours
    expires.setHours(expires.getHours() + 24);
    tokens.push({name, token, expires});
    return token as string;
}

export function verifyToken(token: string){
    const tokenData = tokens.find(t => t.token === token);
    if(!tokenData) return false;
    if(tokenData.expires < new Date()){
        removeToken(token);
        return false;
    }
    return tokenData.name;
}

export function removeToken(token: string){
    tokens = tokens.filter(t => t.token !== token);
}