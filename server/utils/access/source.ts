import { BlockList, isIPv4, isIPv6 } from 'node:net'

/**
 * token が無い接続を、接続元のアドレスとホスト名で管理者と判定する（`access/identity`）。
 *
 * Nitro に依存しない。登録の一覧は呼び出し側が渡す。
 */

/** 登録された接続元ネットワーク（CIDR）のどれかに、アドレスが含まれるか。 */
export function matchesNetwork(address: string | undefined, networks: readonly string[]): boolean {
  if (!address) return false
  const ip = unmapIPv4(address)
  const family = isIPv4(ip) ? 'ipv4' : isIPv6(ip) ? 'ipv6' : null
  if (!family) return false

  const list = new BlockList()
  for (const network of networks) {
    const parsed = parseCidr(network)
    // 形の崩れた登録は、その1件だけを無視する。他の登録まで効かなくしない
    if (parsed) list.addSubnet(parsed.address, parsed.prefix, parsed.family)
  }
  return list.check(ip, family)
}

/** 開かれた URL のホスト名（port を除く）が、登録されたホスト名のどれかと一致するか。 */
export function matchesHost(host: string | undefined, hosts: readonly string[]): boolean {
  if (!host) return false
  const name = hostnameOf(host)
  return hosts.some((registered) => registered.trim().toLowerCase() === name)
}

/** `Host` header の値から port を落とす。`[::1]:3100` のような IPv6 の形も扱う。 */
function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(1, value.indexOf(']'))
  const colon = value.lastIndexOf(':')
  return colon === -1 ? value : value.slice(0, colon)
}

/** `::ffff:192.168.1.20` の形で来た IPv4 を、IPv4 の登録と照らせる形に戻す。 */
function unmapIPv4(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  return mapped ? mapped[1]! : address
}

/** 1件の CIDR を分解する。形が崩れていれば null。prefix が無ければ単一のアドレスとして扱う。 */
export function parseCidr(
  value: string,
): { address: string; prefix: number; family: 'ipv4' | 'ipv6' } | null {
  const [address = '', prefixText] = value.trim().split('/')
  const family = isIPv4(address) ? 'ipv4' : isIPv6(address) ? 'ipv6' : null
  if (!family) return null
  const max = family === 'ipv4' ? 32 : 128
  const prefix = prefixText === undefined ? max : Number(prefixText)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null
  return { address, prefix, family }
}
