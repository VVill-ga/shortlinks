# Shortlinks

```bash
bun run host  #Hosts shortlinks server on port 7000
bun run clean #Deletes links.db
```

**Create shortlink:**
```json
"method": "POST",
"body": {
    "link": "{Link to be directed to}",
    "requestedCode": "{OPTIONAL: Path you would like to direct to the link}"
}
```

This project was created using `bun init` in bun v1.0.35. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
