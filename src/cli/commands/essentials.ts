/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Condensed help for coding agents - shows only the essential commands.
 */
import { Command } from 'commander';
import chalk from 'chalk';

export function createEssentialsCommand(): Command {
  return new Command('essentials')
    .description('Show essential commands for coding agents (condensed help)')
    .action(() => {
      const output = `
${chalk.bold('ArchCodex Essentials')} - The 5 commands you need

${chalk.cyan('Before creating a file:')}
  ${chalk.yellow('discover')} "payment service"     Find the right architecture
  ${chalk.yellow('scaffold')} <arch-id> --name X    Generate file from template

${chalk.cyan('Before adding imports:')}
  ${chalk.yellow('neighborhood')} <file>            Show allowed/forbidden imports

${chalk.cyan('After editing:')}
  ${chalk.yellow('check')} <file>                   Validate constraints

${chalk.cyan('To understand constraints:')}
  ${chalk.yellow('read')} <file> --format ai        Read file with context
  ${chalk.yellow('why')} <file> <constraint>        Explain why a rule applies

${chalk.dim('Full help: archcodex --help')}
`;
      console.log(output);
    });
}
