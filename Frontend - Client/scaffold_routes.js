const fs = require('fs');
const path = require('path');

const routes = {
    '(dashboard)/page.tsx': 'DashboardPage',
    '(dashboard)/analyze/page.tsx': 'AnalyzePage',
    '(dashboard)/calendar/page.tsx': 'EconomicCalendarPage',
    '(dashboard)/news/page.tsx': 'NewsPage',
    '(dashboard)/settings/page.tsx': 'SettingsPage',
    'login/page.tsx': 'LoginPage',
    'register/page.tsx': 'RegisterPage',
    'auth/callback/page.tsx': 'AuthCallbackPage',
};

const appDir = path.join(__dirname, 'src', 'app');

// Also create (dashboard)/layout.tsx
const layoutDir = path.join(appDir, '(dashboard)');
if (!fs.existsSync(layoutDir)) fs.mkdirSync(layoutDir, { recursive: true });
fs.writeFileSync(path.join(layoutDir, 'layout.tsx'), `import { TerminalShellLayout } from "../../components/layout/TerminalShellLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TerminalShellLayout>{children}</TerminalShellLayout>;
}
`);

// Delete old page.tsx
if (fs.existsSync(path.join(appDir, 'page.tsx'))) {
    fs.unlinkSync(path.join(appDir, 'page.tsx'));
}

for (const [routePath, componentName] of Object.entries(routes)) {
    const fullPath = path.join(appDir, routePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    // determine relative path to src/pages
    // fullPath is src/app/...
    const relativePath = path.relative(dir, path.join(__dirname, 'src', 'pages', componentName)).replace(/\\/g, '/');
    
    const content = `import { ${componentName} } from "${relativePath}";\n\nexport default function Page() {\n  return <${componentName} />;\n}\n`;
    fs.writeFileSync(fullPath, content);
}
