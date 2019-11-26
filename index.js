const unified = require('unified')
const markdown = require('remark-parse')
const emoji = require('remark-gemoji-to-emoji')
const remark2rehype = require('remark-rehype')
const raw = require('rehype-raw')
const slug = require('rehype-slug')
const autolinkHeadings = require('rehype-autolink-headings')
const highlight = require('rehype-highlight')
const html = require('rehype-stringify')

const grayMatter = require('gray-matter')
const hasha = require('hasha')
const stableStringify = require('json-stable-stringify')

// Create processor once, if possible.
const defaultProcessor = createProcessor()

module.exports = async function hubdown (markdownString, opts = {}) {
  const hash = makeHash(markdownString, opts)

  const defaults = {
    runBefore: [],
    frontmatter: false,
    ignore: []
  }
  opts = Object.assign(defaults, opts)

  let data = {}
  let content = markdownString

  // check the cache for preprocessed markdown
  if (opts.cache) {
    let existing = false
    try {
      existing = await opts.cache.get(hash)
    } catch (err) {
      if (!err.notFound) console.error(err)
    }
    if (existing) return existing
  }

  if (opts.frontmatter) {
    const parsed = grayMatter(markdownString)
    data = parsed.data
    content = parsed.content
  }

  const processor =
    opts.runBefore.length === 0 && opts.ignore.length === 0
      ? defaultProcessor
      : createProcessor(opts.runBefore, opts.ignore)

  const file = await processor.process(content)
  Object.assign(data, { content: String(file) })

  // save processed markdown in cache
  if (opts.cache) await opts.cache.put(hash, data)

  return data
}

// create a unique hash from the given input (markdown + options object)
function makeHash (markdownString, opts) {
  // copy existing opts object to avoid mutation
  const hashableOpts = Object.assign({}, opts)

  // ignore `cache` prop when creating hash
  delete hashableOpts.cache

  // deterministic stringifier gets a consistent hash from stringified results
  // object keys are sorted to ensure {a:1, b:2} has the same hash as {b:2, a:1}
  // empty object should become an empty string, not {}
  const optsString = Object.keys(hashableOpts).length
    ? stableStringify(hashableOpts)
    : ''

  return hasha(markdownString + optsString)
}

function createProcessor (before, ignore = []) {
  const plugins = [
    {
      name: 'markdown',
      plugin: markdown,
      opts: {}
    },
    {
      name: 'before',
      plugin: before,
      opts: {}
    },
    {
      name: 'emoji',
      plugin: emoji,
      opts: {}
    },
    {
      name: 'remark2rehype',
      plugin: remark2rehype,
      opts: { allowDangerousHTML: true }
    },
    {
      name: 'slug',
      plugin: slug,
      opts: {}
    },
    {
      name: 'autolinkHeadings',
      plugin: autolinkHeadings,
      opts: { behaviour: 'wrap' }
    },
    {
      name: 'highlight',
      plugin: highlight,
      opts: {}
    },
    {
      name: 'raw',
      plugin: raw,
      opts: {}
    },
    {
      name: 'html',
      plugin: html,
      opts: {}
    }
  ]
  const filteredPlugins = plugins.filter(
    plugin => !ignore.includes(plugin.name)
  )

  return filteredPlugins.reduce(
    (acc, plugin) =>
      plugin.plugin ? acc.use(plugin.plugin, plugin.opts) : acc,
    unified()
  )
}
