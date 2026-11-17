import chalk from 'chalk'
import { c } from './colors.js'

export function printBanner(): void {
  const art = chalk.hex('#56d4d4')(`
                          ██████     ██████           ████      █████
                         ███░░███   ███░░███         ░░███     ░░███
 █████ ████ ████████    ░███ ░░░   ░███ ░░░   ██████  ░███   ███████
░░███ ░███ ░░███░░███  ███████    ███████    ███░░███ ░███  ███░░███
 ░███ ░███  ░███ ░███ ░░░███░    ░░░███░    ░███ ░███ ░███ ░███ ░███
 ░███ ░███  ░███ ░███   ░███       ░███     ░███ ░███ ░███ ░███ ░███
 ░░████████ ████ █████  █████      █████    ░░██████  █████░░████████
  ░░░░░░░░ ░░░░ ░░░░░  ░░░░░      ░░░░░      ░░░░░░  ░░░░░  ░░░░░░░░`)
  console.log(art)
  console.log(`\n  ${c.muted('contract explorer')} ${c.bold(`v${__VERSION__}`)}`)
  console.log(`  ${c.dim('by alva-p · https://github.com/alva-p/unffold')}`)
  console.log()
}
