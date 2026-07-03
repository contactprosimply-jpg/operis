import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isPublicRoute, isWebsiteMemberRoute, POST_AUTH_ROUTE } from '@/lib/public-routes'

const AUTH_ENTRY = new Set(['/', '/login', '/signup', '/register'])
const BILLING_EXEMPT = new Set(['/choose-plan', '/settings/billing', '/billing/activating'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/_next')
    || pathname.startsWith('/api')
    || pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const { response, user } = await updateSession(request)

  if (user && AUTH_ENTRY.has(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = POST_AUTH_ROUTE
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (!user && isWebsiteMemberRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (!user && !isPublicRoute(pathname) && !BILLING_EXEMPT.has(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname === '/register') {
    const url = request.nextUrl.clone()
    url.pathname = '/signup'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
