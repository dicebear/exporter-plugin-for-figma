// @ts-ignore
import * as handlebars from 'handlebars/dist/cjs/handlebars.js';

handlebars.registerHelper('isDefined', function (val: unknown, options: unknown) {
  if (val !== undefined) {
    // @ts-ignore
    return options.fn(this);
  }

  // @ts-ignore
  return options.inverse(this);
});

handlebars.registerHelper('isNull', function (val: unknown, options: unknown) {
  if (val === null) {
    // @ts-ignore
    return options.fn(this);
  }

  // @ts-ignore
  return options.inverse(this);
});

handlebars.registerHelper('isNotNull', function (val: unknown, options: unknown) {
  if (val !== null) {
    // @ts-ignore
    return options.fn(this);
  }

  // @ts-ignore
  return options.inverse(this);
});

handlebars.registerHelper('isEqual', function (val: unknown, val2: unknown, options: unknown) {
  if (val === val2) {
    // @ts-ignore
    return options.fn(this);
  }

  // @ts-ignore
  return options.inverse(this);
});

handlebars.registerHelper('blockFallback', function (options: unknown) {
  // @ts-ignore
  const result = options.fn(this).trim();

  if (result.length > 0) {
    // @ts-ignore
    return options.fn(this);
  }

  // @ts-ignore
  return options.inverse(this);
});

export default handlebars;
