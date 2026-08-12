import os
import glob
import re

src_dir = r"D:\Betrix\Frontend - Client\src"

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith(('.ts', '.tsx')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            if "localStorage.getItem(\"eaconsole.sessionToken\")" in content or "localStorage.removeItem(\"eaconsole.sessionToken\")" in content:
                # Replace localStorage calls
                content = content.replace('localStorage.getItem("eaconsole.sessionToken")', 'Cookies.get("eaconsole.sessionToken")')
                content = content.replace('localStorage.removeItem("eaconsole.sessionToken")', 'Cookies.remove("eaconsole.sessionToken")')

                # Add import if not present
                if "import Cookies from 'js-cookie'" not in content and "import Cookies from \"js-cookie\"" not in content:
                    # Find the last import statement or the beginning of the file
                    lines = content.split('\n')
                    last_import_idx = -1
                    for i, line in enumerate(lines):
                        if line.startswith('import '):
                            last_import_idx = i
                    
                    if last_import_idx != -1:
                        lines.insert(last_import_idx + 1, "import Cookies from 'js-cookie';")
                    else:
                        lines.insert(0, "import Cookies from 'js-cookie';")
                    
                    content = '\n'.join(lines)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated {filepath}")
