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
    const users = db.query("SELECT EXISTS (SELECT 1 FROM users)").get();
    if(users) return "";
    const secret = new OTPAuth.Secret();
    db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, true)").run(defaultUsername, defaultPassword, secret.utf8);
    
    // Export the admin secret to a file
    const secretFile = Bun.file("./temp/admin.secret");
    Bun.write(secretFile, secret.utf8);

    // Print the admin secret qr code to the console
    qrcode.toString(secret.utf8, {type:'terminal'}, function (err, url) {
    console.log(url);
    })

    // Export the admin secret to a qr code image file
    qrcode.toFile("./temp/admin.secret.png", secret.utf8);
}

export function createUser(name: string, password: string, admin: boolean, db: Database): string {
    const exists = db.query("SELECT * FROM users WHERE name=?").get(name);
    if(exists) return "";
    const secret = new OTPAuth.Secret();
    db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, ?4)").run(name, password, secret.utf8, admin);
    return secret.utf8;
}

export function loginUser(name: string, password: string, otp: string, db: Database){
    const user = db.query("SELECT * FROM users WHERE name=?").get(name) as User;
    if(!user) return false;
    if(user.password !== password) return false;
    let totp = new OTPAuth.TOTP({
        issuer: "shortlinks",
        secret: user.secret
    });
    if(!totp.validate({token: otp})) return false;
    return createToken(name);
}

export function createToken(name: string): string{
    const token = crypto.randomUUID();
    const expires = new Date();
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