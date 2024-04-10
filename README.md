# Shortlinks

A simple Bun webserver for creating and utilizing url redirects with a PicoCSS driven web front end. Best if used with a short domain name!

### Testing
```bash
bun i          # Installs node modules
bun run host   # Hosts shortlinks server on port 7000
bun run clean  # Deletes links.db
```

### Production (Systemd)
```bash
# edit shortlinks.service to reference repo location
cp shortlinks.service /usr/lib/systemd/system/shortlinks.service
sudo systemctl daemon-reload
sudo systemctl enable shortlinks
sudo systemctl start shortlinks
```


## API

### Creating Shortlink: /
```json
"method": "POST",
"body": {
    "link": "{Link to be directed to}",
    "requestedCode": "{OPTIONAL: Path you would like to direct to the link}"
}
```

### Responses
- **200**: `"{Shortlink code (text after '/')}"`
- **400**: `"Missing Destination Link" || "Error Parsing JSON"`
- **409**: `"Request for specific path denied"`

## Acknowledgements

[Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

[Pico CSS](https://picocss.com) is a Minimal CSS Framework for Semantic HTML.