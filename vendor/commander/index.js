function camelCase(flag) {
  return flag.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

class Command {
  constructor() {
    this._name = 'command';
    this._description = '';
    this._argument = null;
    this._options = [];
    this._action = null;
  }

  name(value) {
    this._name = value;
    return this;
  }

  description(value) {
    this._description = value;
    return this;
  }

  argument(definition, description) {
    this._argument = { definition, description };
    return this;
  }

  option(flags, description, parserOrDefault, maybeDefault) {
    const flagList = flags.split(',').map((flag) => flag.trim().split(' ')[0]);
    const longFlag = flagList.find((flag) => flag.startsWith('--'));
    const shortFlag = flagList.find((flag) => flag.startsWith('-') && !flag.startsWith('--'));
    const parser = typeof parserOrDefault === 'function' ? parserOrDefault : null;
    const defaultValue = typeof parserOrDefault === 'function' ? maybeDefault : parserOrDefault;

    this._options.push({
      flags,
      description,
      key: camelCase(longFlag),
      longFlag,
      shortFlag,
      expectsValue: /<.+>/.test(flags),
      parser,
      defaultValue
    });
    return this;
  }

  action(handler) {
    this._action = handler;
    return this;
  }

  helpInformation() {
    const argumentUsage = this._argument ? ` ${this._argument.definition}` : '';
    const lines = [
      `Usage: ${this._name}${argumentUsage} [options]`,
      ''
    ];

    if (this._description) {
      lines.push(this._description, '');
    }

    if (this._options.length) {
      lines.push('Options:');
      for (const option of this._options) {
        lines.push(`  ${option.flags}\t${option.description}`);
      }
      lines.push('  -h, --help\tdisplay help for command');
    }

    return lines.join('\n');
  }

  async parseAsync(argv = process.argv) {
    const args = argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
      console.log(this.helpInformation());
      return this;
    }

    const options = Object.fromEntries(this._options.map((option) => [option.key, option.defaultValue]));
    const positionals = [];

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      const option = this._options.find((item) => item.longFlag === token || item.shortFlag === token);
      if (!option) {
        positionals.push(token);
        continue;
      }

      if (!option.expectsValue) {
        options[option.key] = true;
        continue;
      }

      const value = args[index + 1];
      index += 1;
      if (value === undefined) {
        throw new Error(`Missing value for ${token}`);
      }

      options[option.key] = option.parser
        ? option.parser(value, options[option.key])
        : value;
    }

    if (this._argument && !positionals.length) {
      throw new Error(`Missing required argument ${this._argument.definition}`);
    }

    if (this._action) {
      await this._action(positionals[0], options);
    }

    return this;
  }
}

module.exports = { Command };
