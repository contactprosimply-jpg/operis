export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import {
  customFolderLabel,
  joinMailboxPath,
  type CachedImapFolder,
} from '@/lib/mail-folders'
import { resolveMailAccount, mapMailAccountRow } from '@/lib/mail-sync'
import { resolveSpecialMailboxes } from '@/lib/imap-client'
import {
  imapCreateMailbox,
  imapDeleteMailbox,
  imapGetMailboxDelimiter,
} from '@/lib/mail-imap-actions'

async function loadCustomFoldersForUser(userId: string) {
  const db = createAdminClient()
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('id, imap_user, smtp_user, cached_imap_folders')
    .eq('user_id', userId)
    .eq('is_active', true)

  const custom: CachedImapFolder[] = []
  const accountList: Array<{ id: string; email: string }> = []

  for (const acc of accounts ?? []) {
    accountList.push({
      id: acc.id,
      email: acc.imap_user ?? acc.smtp_user ?? '',
    })
    const cached = acc.cached_imap_folders as Array<{ path: string; name?: string }> | null
    if (Array.isArray(cached)) {
      for (const f of cached) {
        if (f.path && !custom.some(c => c.path === f.path)) {
          custom.push({ path: f.path, name: f.name ?? customFolderLabel(f.path) })
        }
      }
    }
  }

  return { custom, accountList }
}

async function refreshCachedFolders(
  userId: string,
  accountId: string,
  account: NonNullable<ReturnType<typeof mapMailAccountRow>>,
) {
  const db = createAdminClient()
  const mailboxes = await resolveSpecialMailboxes(account)
  const cached = (mailboxes.custom ?? []).map(path => ({
    path,
    name: customFolderLabel(path),
  }))
  await db.from('mail_accounts').update({ cached_imap_folders: cached }).eq('id', accountId)
  return cached
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { custom, accountList } = await loadCustomFoldersForUser(userId)

  return Response.json({
    success: true,
    data: { accounts: accountList, customFolders: custom },
  })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const name = String(body?.name ?? '').trim()
  const parentPath = body?.parentPath ? String(body.parentPath).trim() : undefined

  if (!name) {
    return Response.json({ success: false, error: 'Nom du dossier requis' }, { status: 400 })
  }
  if (name.length > 80) {
    return Response.json({ success: false, error: 'Nom trop long (max 80 caractères)' }, { status: 400 })
  }

  const account = await resolveMailAccount(userId)
  if (!account?.id) {
    return Response.json({ success: false, error: 'Compte mail non configuré' }, { status: 400 })
  }

  const delimiter = await imapGetMailboxDelimiter(account)
  const fullPath = joinMailboxPath(parentPath, name, delimiter)
  const created = await imapCreateMailbox(account, fullPath)
  if (!created) {
    return Response.json({ success: false, error: 'Impossible de créer le dossier sur le serveur' }, { status: 500 })
  }

  const db = createAdminClient()
  const mapped = mapMailAccountRow({
    id: account.id!,
    imap_host: account.imap_host,
    imap_port: account.imap_port,
    imap_user: account.imap_user,
    imap_pass: account.imap_pass,
    smtp_user: account.smtp_user,
  })
  if (!mapped) {
    return Response.json({ success: false, error: 'Compte mail invalide' }, { status: 400 })
  }

  const cached = await refreshCachedFolders(userId, account.id!, mapped)
  const folder = cached.find(f => f.path === created.path) ?? {
    path: created.path,
    name: customFolderLabel(created.path),
  }

  return Response.json({
    success: true,
    data: { folder, customFolders: cached },
  })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const path = req.nextUrl.searchParams.get('path')
  if (!path) {
    return Response.json({ success: false, error: 'path requis' }, { status: 400 })
  }

  const account = await resolveMailAccount(userId)
  if (!account?.id) {
    return Response.json({ success: false, error: 'Compte mail non configuré' }, { status: 400 })
  }

  const ok = await imapDeleteMailbox(account, path)
  if (!ok) {
    return Response.json({ success: false, error: 'Impossible de supprimer le dossier sur le serveur' }, { status: 500 })
  }

  const db = createAdminClient()
  await db
    .from('emails')
    .delete()
    .eq('user_id', userId)
    .eq('imap_mailbox', path)

  const mapped = mapMailAccountRow({
    id: account.id!,
    imap_host: account.imap_host,
    imap_port: account.imap_port,
    imap_user: account.imap_user,
    imap_pass: account.imap_pass,
    smtp_user: account.smtp_user,
  })
  if (!mapped) {
    return Response.json({ success: false, error: 'Compte mail invalide' }, { status: 400 })
  }

  const cached = await refreshCachedFolders(userId, account.id!, mapped)

  return Response.json({
    success: true,
    data: { customFolders: cached },
  })
}
