const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');

const corrections = {
    "iBannerOutlineColorFriendly": { newName: "uBannerOutlineColorFriendly", default: "0xFF00" },
    "iBannerOutlineColorEnemy": { newName: "uBannerOutlineColorEnemy", default: "0xFF0000" },
    "iBannerOutlineColorNeutral": { newName: "uBannerOutlineColorNeutral", default: "0xFF" },
    "iFakeCharacterShadowColor": { newName: "uFakeCharacterShadowColor", default: "0xff000915" },
    "iMultiplayerChatColor": { newName: "uMultiplayerChatColor", default: "0xFFCCCCCC" },
    "iMultiplayerTeamChatColor": { newName: "uMultiplayerTeamChatColor", default: "0xFF8888CC" }
};

try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    let updates = 0;

    for (const section in config) {
        // We need to iterate keys safely because we are modifying them
        const keys = Object.keys(config[section]);
        for (const key of keys) {
            if (corrections[key]) {
                const fix = corrections[key];
                const entry = config[section][key];

                // Remove old key
                delete config[section][key];

                // Update entry properties
                entry.name = entry.name.replace("iBanner", "uBanner") // Names seem fine actually, text didn't change, just key
                                       .replace("iFake", "uFake")
                                       .replace("iMultiplayer", "uMultiplayer");
                                       
                entry.type = "text"; // Treat as text to preserve hex string
                entry["default-value"] = fix.default;
                entry.inputType = "color-hex"; // Custom type for renderer to handle if we want
                
                // Add new key
                config[section][fix.newName] = entry;
                updates++;
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`Fixed hex color keys in config.json. Updated entries: ${updates}`);

} catch (e) {
    console.error("Error fixing hex colors:", e);
}
