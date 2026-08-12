import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Get token from cookies (Industry standard for SSR Auth)
  const token = request.cookies.get('eaconsole.sessionToken')?.value;
  const { pathname } = request.nextUrl;

  // Define public routes
  const isPublicRoute = pathname.startsWith('/login') || pathname.startsWith('/register');

  if (!token && !isPublicRoute) {
    // Redirect unauthenticated users to login, preventing client-side loading flashes
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') {
      url.searchParams.set('from', pathname);
    }
    return NextResponse.redirect(url);
  }

  if (token && isPublicRoute) {
    // Redirect authenticated users away from public routes (like /login)
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
