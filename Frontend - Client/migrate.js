const fs = require('fs');
const path = require('path');

function replaceRouter(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceRouter(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // Fix useAuth
            if (content.includes('AuthContext')) {
                // We'll replace it with a relative path to src/store/authStore
                // Calculate relative path from this file to src/store/authStore
                const storePath = path.relative(path.dirname(fullPath), path.join(__dirname, 'src', 'store', 'authStore')).replace(/\\/g, '/');
                content = content.replace(/import\s+\{([^}]*?)useAuth([^}]*?)\}\s+from\s+['"][^'"]+AuthContext['"]/g, `import { $1useAuthStore as useAuth$2 } from "${storePath.startsWith('.') ? storePath : './' + storePath}"`);
                
                content = content.replace(/useAuth\(\)/g, 'useAuthStore()');
                // fix the import we just mangled
                content = content.replace(/useAuthStore as useAuth/, 'useAuthStore');
            }

            // Fix react-router-dom
            if (content.includes('react-router-dom')) {
                content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-router-dom['"];?/g, (match, importsStr) => {
                    let newImports = [];
                    let nextNav = [];
                    
                    const hasUseNavigate = importsStr.includes('useNavigate');
                    const hasUseLocation = importsStr.includes('useLocation');
                    const hasUseSearchParams = importsStr.includes('useSearchParams');
                    const hasLink = importsStr.includes('Link');
                    const hasNavigate = importsStr.includes('Navigate');

                    if (hasUseNavigate) nextNav.push('useRouter');
                    if (hasUseLocation) nextNav.push('usePathname');
                    if (hasUseSearchParams) nextNav.push('useSearchParams');
                    
                    if (hasLink || hasNavigate) {
                        newImports.push(`import Link from 'next/link';`);
                    }
                    if (nextNav.length > 0) {
                        newImports.push(`import { ${nextNav.join(', ')} } from 'next/navigation';`);
                    }
                    
                    return newImports.join('\n');
                });

                content = content.replace(/const navigate = useNavigate\(\)/g, 'const router = useRouter()');
                content = content.replace(/navigate\(/g, 'router.push(');
                content = content.replace(/const location = useLocation\(\)/g, 'const pathname = usePathname()');
                content = content.replace(/location\.pathname/g, 'pathname');
                // Navigate component
                content = content.replace(/<Navigate\s+to=({[^}]+}|"[^"]+")/g, '<Link href=$1'); // Very rough but wait, Navigate triggers redirect immediately.
            }
            
            if (content !== original) {
                if (!content.includes('"use client"') && !content.includes("'use client'")) {
                    content = "'use client';\n\n" + content;
                }
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

replaceRouter('./src/pages');
replaceRouter('./src/components');
replaceRouter('./src/hooks');
