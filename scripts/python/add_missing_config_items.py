
import json
import os

def update_files():
    config_path = 'config.json'
    locales_dir = 'locales'
    
    # 1. Update config.json
    with open(config_path, 'r', encoding='utf-8') as f:
        config_data = json.load(f)

    # Add Battle item
    if 'Battle' in config_data:
        if 'iDynamicBannerTransparencyMinAlpha' not in config_data['Battle']:
            config_data['Battle']['iDynamicBannerTransparencyMinAlpha'] = {
                "name": "Dynamic Banner Transparency Min Alpha",
                "description": "Configures the Dynamic Banner Transparency Min Alpha setting.",
                "type": "number",
                "default-value": 165,
                "inputType": "number",
                "step": 1
            }
            print("Added iDynamicBannerTransparencyMinAlpha to Battle")

    # Add Input items
    if 'Input' in config_data:
        items_to_add = {
            "bEnableGamepadVibration": {
                "name": "Enable Gamepad Vibration",
                "description": "Configures the Enable Gamepad Vibration setting.",
                "type": "checkbox",
                "default-value": True
            },
            "iGamepadLeftThumbDeadzone": {
                "name": "Gamepad Left Thumb Deadzone",
                "description": "Configures the Gamepad Left Thumb Deadzone setting.",
                "type": "number",
                "default-value": 10000,
                "inputType": "number",
                "step": 1
            },
            "iGamepadRightThumbDeadzone": {
                "name": "Gamepad Right Thumb Deadzone",
                "description": "Configures the Gamepad Right Thumb Deadzone setting.",
                "type": "number",
                "default-value": 10000,
                "inputType": "number",
                "step": 1
            },
            "iGamepadTriggerThreshold": {
                "name": "Gamepad Trigger Threshold",
                "description": "Configures the Gamepad Trigger Threshold setting.",
                "type": "number",
                "default-value": 128,
                "inputType": "number",
                "step": 1
            }
        }
        for key, value in items_to_add.items():
            if key not in config_data['Input']:
                config_data['Input'][key] = value
                print(f"Added {key} to Input")

    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config_data, f, indent=4, ensure_ascii=False)

    # 2. Update locales
    new_keys_desc = {
        # Descriptions
        "Configures the Dynamic Banner Transparency Min Alpha setting.": {
            "tr": "Dinamik Sancak Saydamlığı Minimum Alpha ayarını yapılandırır.",
            "ru": "Настраивает минимальную прозрачность динамического знамени."
        },
        "Configures the Enable Gamepad Vibration setting.": {
            "tr": "Oyun Kumandası Titreşimini Etkinleştir ayarını yapılandırır.",
            "ru": "Настраивает параметр включения вибрации геймпада."
        },
        "Configures the Gamepad Left Thumb Deadzone setting.": {
            "tr": "Oyun Kumandası Sol Çubuk Ölü Bölge ayarını yapılandırır.",
            "ru": "Настраивает мертвую зону левого стика геймпада."
        },
        "Configures the Gamepad Right Thumb Deadzone setting.": {
            "tr": "Oyun Kumandası Sağ Çubuk Ölü Bölge ayarını yapılandırır.",
            "ru": "Настраивает мертвую зону правого стика геймпада."
        },
        "Configures the Gamepad Trigger Threshold setting.": {
            "tr": "Oyun Kumandası Tetik Eşiği ayarını yapılandırır.",
            "ru": "Настраивает порог срабатывания триггера геймпада."
        },
        # Names
        "Dynamic Banner Transparency Min Alpha": {
            "tr": "Dinamik Sancak Saydamlığı Minimum Alpha",
            "ru": "Минимальная прозрачность динамического знамени"
        },
        "Enable Gamepad Vibration": {
            "tr": "Oyun Kumandası Titreşimini Etkinleştir",
            "ru": "Включить вибрацию геймпада"
        },
        "Gamepad Left Thumb Deadzone": {
            "tr": "Oyun Kumandası Sol Çubuk Ölü Bölge",
            "ru": "Мертвая зона левого стика геймпада"
        },
        "Gamepad Right Thumb Deadzone": {
            "tr": "Oyun Kumandası Sağ Çubuk Ölü Bölge",
            "ru": "Мертвая зона правого стика геймпада"
        },
        "Gamepad Trigger Threshold": {
            "tr": "Oyun Kumandası Tetik Eşiği",
            "ru": "Порог срабатывания триггера геймпада"
        }
    }
    
    langs = ['en', 'tr', 'ru']
    
    for lang in langs:
        file_path = os.path.join(locales_dir, f'{lang}.json')
        if not os.path.exists(file_path):
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            locale_data = json.load(f)
            
        # We need to add the keys. The keys in locale file match the "description" in config.json?
        # Based on previous context, the locale file keys ARE the english descriptions or names?
        # Let's assume the locale file structure is "English Text": "Translated Text".
        # Check en.json first.
        
        # If en.json, we map English -> English (identity)
        # If tr.json, we map English -> Turkish
        
        for eng_desc, translations in new_keys_desc.items():
            if lang == 'en':
                locale_data[eng_desc] = eng_desc
            elif lang == 'tr':
                locale_data[eng_desc] = translations['tr']
            elif lang == 'ru':
                locale_data[eng_desc] = translations['ru']
                
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(locale_data, f, indent=4, ensure_ascii=False)
        print(f"Updated {lang}.json")

if __name__ == "__main__":
    update_files()
