import { c } from './colors.js'

export async function showMenu(): Promise<string | null> {
  // Check if TTY
  if (!process.stdout.isTTY) return null

  try {
    const { default: inquirer } = await import('inquirer')
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: c.muted('What do you want to do?'),
        choices: [
          { name: 'inspect proxy', value: 'proxy' },
          { name: 'show inheritance tree', value: 'tree' },
          { name: 'security surface', value: 'security' },
          { name: 'watch events', value: 'watch' },
          { name: 'inspect storage', value: 'storage' },
          { name: 'export to foundry', value: 'export' },
          { name: 'open on etherscan', value: 'etherscan' },
          { name: 'exit', value: 'exit' },
        ],
      },
    ])
    return action as string
  } catch {
    return null
  }
}
