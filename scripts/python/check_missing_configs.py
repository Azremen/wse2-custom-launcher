
import json
import configparser
import os

def check_missing():
    json_path = 'config.json'
    ini_path = '/home/azremen/Documents/Mount&Blade Warband WSE2/rgl_config.ini'

    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return
    if not os.path.exists(ini_path):
        print(f"Error: {ini_path} not found.")
        return

    # Load JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        config_data = json.load(f)

    # Load INI with case sensitivity
    ini_config = configparser.ConfigParser()
    ini_config.optionxform = str  # Preserve case
    ini_config.read(ini_path)

    missing_items = []
    
    # Iterate over INI sections
    for section in ini_config.sections():
        # JSON equivalent section check
        if section not in config_data:
            # print(f"Missing Section within JSON: {section}")
            for key in ini_config[section]:
                missing_items.append(f"[{section}] {key}")
            continue
        
        # Iterate over keys in section
        for key in ini_config[section]:
            if key not in config_data[section]:
                missing_items.append(f"[{section}] {key}")

    if missing_items:
        print("Missing items in config.json compared to rgl_config.ini:")
        for item in missing_items:
            print(item)
    else:
        print("No missing items found. config.json covers all keys in rgl_config.ini.")

if __name__ == "__main__":
    check_missing()
