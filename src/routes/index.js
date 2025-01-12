const express = require('express')
const DB = require('better-sqlite3-helper')
const format = require('date-fns/format')
const createError = require('http-errors')
const aAnAre = require('../filters/aAnAre')
const path = require('path')
const sizeOf = require('image-size')

const router = express.Router()
const APIRouter = express.Router()

const { escapeHtml, getPercent, getRandomItems, parseBoolean } = require('./utils')

/* Constants */
const EARLIEST_RECORDED_PREDICTION = DB()
  .prepare('SELECT MIN(year) as year FROM predictions;')
  .get().year

// ~@TODO: This should actually be 2022 until Feb 2nd
const CURRENT_YEAR = new Date().getFullYear()

// ~@TODO: fix this as well. right now it is not that good, but fast
const _getDaysToGroundhogDay = () => {
  const diffInMs = new Date('2023-02-02Z05:00:00') - new Date()
  return Math.ceil(diffInMs / (1000 * 60 * 60 * 24))
}

/* Request functions */
const _getUrlFromRequest = (req, { withPath = true, trailingSlash = true } = {}) => {
  let url = 'https://' + req.get('host')
  url = withPath ? `${url}${req.path}` : url
  return trailingSlash
    ? url.endsWith('/')
      ? url
      : `${url}/`
    : url.endsWith('/')
    ? url.slice(0, -1) // eslint-disable-line indent
    : url // eslint-disable-line indent
}

const _getPageMeta = (req, { description, slug, speakable } = {}) => {
  let dimensions
  if (slug) {
    dimensions = sizeOf(path.resolve(__dirname, `../../public/images/ghogs/og-image/${slug}.png`))
  }

  return {
    ...(description && { description }),
    ...(slug && { image: slug, imageWidth: dimensions.width, imageHeight: dimensions.height }),
    canonical: _getUrlFromRequest(req, { trailingSlash: false }),
    baseUrl: _getUrlFromRequest(req, { withPath: false }),
    speakable,
  }
}

/* Queries */
const getGroundhogSlugs = () =>
  DB()
    .prepare('SELECT slug FROM groundhogs;')
    .all()
    .map((row) => row.slug)

const getGroundhogIDs = () =>
  DB()
    .prepare('SELECT id FROM groundhogs;')
    .all()
    .map((row) => row.id)

const getPredictionsByYear = (year) => {
  let predictions = DB()
    .prepare(
      `
    SELECT json_object(
      'year', p.year,
      'shadow', p.shadow,
      'details', p.details,
      'groundhog', (SELECT json_object(
        'id', g.id,
        'slug', g.slug,
        'shortname', g.shortname,
        'name', g.name,
        'city', g.city,
        'region', g.region,
        'country', g.country,
        'source', g.source,
        'contact', g.contact,
        'currentPrediction', g.currentPrediction,
        'isGroundhog', g.isGroundhog,
        'type', g.type,
        'active', g.active,
        'description', g.description,
        'image', g.image
      ) AS gh
      FROM groundhogs AS g
      WHERE g.slug = p.slug
    )) AS predictions
    FROM predictions AS p
    WHERE year = ?
    ORDER BY (SELECT Count(*) FROM predictions WHERE slug = p.slug) DESC;`,
    )
    .all(year)

  return predictions.map((p) => JSON.parse(p.predictions))
}

// TODO: due to the subquery, this call might be inefficient
// Could fix this with 2 calls (all predictions + all groundhogs) and then loop through in code
const _getPredictions = ({ since = 2018 } = {}) => {
  let predictions = DB()
    .prepare(
      `
    SELECT json_group_array(json_object(
      'year', p.year,
      'shadow', p.shadow,
      'details', p.details,
      'groundhog', (SELECT json_object(
        'id', g.id,
        'slug', g.slug,
        'shortname', g.shortname,
        'name', g.name,
        'city', g.city,
        'region', g.region,
        'country', g.country,
        'source', g.source,
        'contact', g.contact,
        'currentPrediction', g.currentPrediction,
        'isGroundhog', g.isGroundhog,
        'type', g.type,
        'active', g.active,
        'description', g.description,
        'image', g.image
      )
      FROM groundhogs AS g
      WHERE g.slug = p.slug
    ))) AS predictions
    FROM predictions AS p
    WHERE p.year >= ?;
  `,
    )
    .all(since)

  const formattedPredictions = {}
  let parsed = JSON.parse(predictions[0].predictions)

  parsed.forEach((p) => {
    if (!formattedPredictions[p.year]) formattedPredictions[p.year] = []
    formattedPredictions[p.year].push(p)
  })

  // return obj like {2020: [...], 2021: [...], 2022: [...]}
  return formattedPredictions
}

const _getGroundhog = (value, { identifier = 'slug', oldestFirst = false } = {}) => {
  const orderBy = oldestFirst ? 'ASC' : 'DESC'
  const by = identifier === 'slug' ? 'slug' : 'id'

  let { groundhog } = DB()
    .prepare(
      `
    SELECT json_object(
      'id', g.id,
      'slug', g.slug,
      'shortname', g.shortname,
      'name', g.name,
      'city', g.city,
      'region', g.region,
      'country', g.country,
      'source', g.source,
      'contact', g.contact,
      'currentPrediction', g.currentPrediction,
      'isGroundhog', g.isGroundhog,
      'type', g.type,
      'active', g.active,
      'description', g.description,
      'image', g.image,
      'predictions', (
        SELECT json_group_array(json(o))
        FROM (SELECT json_object(
              'year', p.year,
              'shadow', p.shadow,
              'details', p.details
            ) AS o
            FROM predictions AS p
            WHERE p.slug = g.slug
            ORDER BY p.year ${orderBy}
        )
      )
    ) AS groundhog
    FROM groundhogs AS g
    WHERE ${by} = ?;`,
    )
    .get(value)

  return JSON.parse(groundhog)
}

const getGroundhogById = (id, { oldestFirst = false } = {}) => {
  return _getGroundhog(id, { identifier: 'id', oldestFirst })
}

const getGroundhogBySlug = (slug, { oldestFirst = true } = {}) => {
  return _getGroundhog(slug, { identifier: 'slug', oldestFirst })
}

const getGroundhogs = ({
  oldestFirst = false,
  year = false,
  country = undefined,
  isGroundhog = undefined,
} = {}) => {
  const orderBy = oldestFirst ? 'ASC' : 'DESC'
  const predictionKey = year ? 'latestPrediction' : 'predictions'
  const yearClause = year ? 'AND p.year = 2022' : ''
  let whereClause = ['USA', 'Canada'].includes(country) ? `g.country = '${country}'` : '1 = 1'
  if (isGroundhog !== undefined) {
    whereClause = `${whereClause} AND isGroundhog='${isGroundhog ? 1 : 0}'`
  }

  let [{ groundhogs }] = DB()
    .prepare(
      `
      SELECT json_group_array(
        json_object(
        'id', g.id,
        'slug', g.slug,
        'shortname', g.shortname,
        'name', g.name,
        'city', g.city,
        'region', g.region,
        'country', g.country,
        'source', g.source,
        'contact', g.contact,
        'currentPrediction', g.currentPrediction,
        'isGroundhog', g.isGroundhog,
        'type', g.type,
        'active', g.active,
        'description', g.description,
        'image', g.image,
        'predictionsCount', (SELECT json_array_length(json_group_array(id)) FROM predictions WHERE slug=g.slug AND shadow IS NOT NULL),
        '${predictionKey}', (
          ${year ? '' : 'SELECT json_group_array(json(o)) FROM ('}
          SELECT json_object(
                'year', p.year,
                'shadow', p.shadow,
                'details', p.details
              ) AS o
              FROM predictions AS p
              WHERE p.slug = g.slug ${yearClause}
              ORDER BY p.year ${orderBy}
          )
        )
        ${year ? '' : ')'}
      ) as groundhogs
      FROM groundhogs AS g
      WHERE ${whereClause};`,
    )
    .all()

  return JSON.parse(groundhogs)
}

/* Middleware */
const validYear = (req, res, next) => {
  let year = req.params.year || req.query.year
  year = parseInt(year)

  if (isNaN(year) || year < EARLIEST_RECORDED_PREDICTION || year > CURRENT_YEAR) {
    throw new createError(
      400,
      `The 'year' must be between ${escapeHtml(EARLIEST_RECORDED_PREDICTION)} and ${escapeHtml(
        CURRENT_YEAR,
      )} (inclusive).`,
    )
  }

  next()
}

const validId = (req, res, next) => {
  const id = parseInt(req.params.gId)
  const ids = getGroundhogIDs()

  if (isNaN(id) || !ids.includes(id)) {
    throw new createError(400, `Bad groundhog identifier ('${escapeHtml(id)}'), pick a real one.`)
  }

  next()
}

const validSlug = (req, res, next) => {
  const slug = req.params.slug
  const slugs = getGroundhogSlugs()

  if (!slug) {
    const randomSlug = slugs[Math.floor(Math.random() * slugs.length)]
    throw new createError(
      400,
      `You didn’t pick a groundhog. Here’s a random one: <a href="/groundhogs/${escapeHtml(
        randomSlug,
      )}">${escapeHtml(randomSlug)}</a>`,
    )
  }

  if (!slugs.includes(slug)) {
    throw new createError(
      400,
      `Bad groundhog identifier ('${escapeHtml(slug)}'), maybe you spelled it wrong?`,
    )
  }

  next()
}

const redirectYear = (req, res, next) => {
  if (!req.query.year) {
    const currentYear = new Date().getFullYear()
    return res.redirect(`/api/v1/predictions?year=${currentYear}`)
  }

  next()
}

/* GET home page. */
router.get('/', function (req, res) {
  const _predictions = _getPredictions({ since: 2020 })
  const _years = Object.keys(_predictions).reverse() // otherwise earlier years come first
  const predictionResults = []

  _years.forEach((year) => {
    const yearPredictions = { year, prediction: '', groundhogs: { winter: 0, spring: 0 } }

    _predictions[year].forEach((prediction) => {
      const season = prediction.shadow ? 'winter' : 'spring'
      yearPredictions['groundhogs'][season]++
    })

    // TODO: if they are equal, this breaks
    yearPredictions.prediction =
      yearPredictions.groundhogs.winter >= yearPredictions.groundhogs.spring ? 'winter' : 'spring'

    predictionResults.push(yearPredictions)
  })

  // get groundhogs data
  const totalGroundhogs = _predictions[CURRENT_YEAR].length
  let _currentYearPredictions = getRandomItems(_predictions[CURRENT_YEAR])
  const randomGroundhogs = _currentYearPredictions.map((p) => {
    const { shadow, groundhog: { slug, name, region, country } = {} } = p
    return {
      name,
      slug,
      shadow,
      location: `${region}, ${country}`,
    }
  })

  res.render('pages/index', {
    title: 'GROUNDHOG-DAY.com',
    daysLeft: _getDaysToGroundhogDay(),
    predictionResults,
    randomGroundhogs,
    totalGroundhogs,
    pageMeta: _getPageMeta(req, {
      description:
        'GROUNDHOG-DAY.com is the leading Groundhog Day data source: cataloging North America’s prognosticating animals and their yearly weather predictions.',
    }),
  })
})

/* GET about page. */
router.get('/about', function (req, res) {
  res.render('pages/about', {
    title: 'About',
    pageMeta: _getPageMeta(req, {
      description:
        'Groundhog Day is a lighthearted holiday celebrated annually across North America in which ‘prognosticating’ animals predict the onset of spring.',
      speakable: true,
    }),
  })
})

/* GET history page. */
router.get('/history-of-groundhog-day', function (req, res) {
  res.render('pages/history', {
    title: 'History of Groundhog Day',
    pageMeta: _getPageMeta(req, {
      description: 'The history of our modern Groundhog Day. It’s exactly as weird as you think.',
      speakable: true,
    }),
  })
})

/* GET "add groundhog" page. */
router.get('/add-groundhog', function (req, res) {
  res.render('pages/add-groundhog', {
    title: 'Add a groundhog',
    pageMeta: _getPageMeta(req, {
      description:
        'Add new groundhogs to GROUNDHOG-DAY.com: the more we have, the more accurate we are. It’s science.',
    }),
  })
})

/* GET api page. */
router.get('/api', function (req, res) {
  res.render('pages/api', {
    title: 'Groundhog Day API',
    pageMeta: _getPageMeta(req, {
      description:
        'A free JSON API for North America’s prognosticating animals and their yearly weather predictions.',
    }),
  })
})

/* GET contact page. */
router.get('/contact', function (req, res) {
  res.render('pages/contact', {
    title: 'Contact',
    pageMeta: _getPageMeta(req, {
      description:
        'Please reach out with any questions, concerns, or general feedback. Unlike Jimmy the Groundhog, I don’t bite.',
    }),
  })
})

router.get('/predictions', function (req, res) {
  const _predictions = _getPredictions({ since: 1886 })
  const _years = Object.keys(_predictions).reverse() // otherwise earlier years come first
  const predictionResults = []

  _years.forEach((year) => {
    const yearPredictions = { year, prediction: '', groundhogs: { winter: 0, spring: 0, null: 0 } }

    _predictions[year].forEach((prediction) => {
      const season =
        prediction.shadow === 1 ? 'winter' : prediction.shadow === 0 ? 'spring' : 'null'
      yearPredictions['groundhogs'][season]++
    })

    yearPredictions.prediction =
      yearPredictions.groundhogs.winter === yearPredictions.groundhogs.spring
        ? 'tied'
        : yearPredictions.groundhogs.winter >= yearPredictions.groundhogs.spring
        ? 'winter' // eslint-disable-line indent
        : 'spring' // eslint-disable-line indent

    predictionResults.push(yearPredictions)
  })

  res.render('pages/years', {
    title: 'Predictions by year',
    predictions: predictionResults,
    oldestPrediction: predictionResults[predictionResults.length - 1].year,
    pageMeta: _getPageMeta(req, {
      description: `See and compare groundhog predictions by year, from ${CURRENT_YEAR} back to ${EARLIEST_RECORDED_PREDICTION} (which was before TikTok).`,
    }),
  })
})

router.get('/predictions/2023', function (req, res) {
  return res.redirect('/groundhog-day-2023')
})

/* GET predictions page for a year. */
router.get('/predictions/:year', validYear, function (req, res) {
  const year = parseInt(req.params.year)
  const predictionTotals = { years: 0, total: 0, winter: 0, spring: 0, null: 0 }

  const years = {
    year,
    next: year === CURRENT_YEAR ? undefined : year + 1,
    prev: year === EARLIEST_RECORDED_PREDICTION ? undefined : year - 1,
  }

  const dateString = format(new Date(`${year}-02-02T00:00:00`), 'iiii, MMMM do')

  let predictions = getPredictionsByYear(year)

  predictions.forEach((prediction) => {
    ++predictionTotals['years']

    prediction['shadow'] === 1
      ? ++predictionTotals['winter'] && ++predictionTotals['total']
      : prediction['shadow'] === 0
      ? ++predictionTotals['spring'] && ++predictionTotals['total'] // eslint-disable-line indent
      : ++predictionTotals['null'] // eslint-disable-line indent
  })

  // sort by most predictions to least predictions
  predictions.sort((a, b) => {
    return a.shadow === null ? 1 : b.shadow === null ? -1 : a.shadow - b.shadow
  })

  /* eslint-disable */
  const intro = {
    lead: `In ${year}, Groundhog Day was on ${dateString}`,
    predictionIntro:
      predictionTotals['winter'] === predictionTotals['spring'] ? '' : 'Most groundhogs predicted',
    predictionConclusion:
      predictionTotals['total'] === 0
        ? 'No predictions were reported for this year'
        : predictionTotals['winter'] === predictionTotals['spring']
        ? 'Half of groundhogs predicted an early spring, and half predicted a longer winter'
        : predictionTotals['winter'] > predictionTotals['spring']
        ? 'a longer winter'
        : 'an early spring',
  }
  /* eslint-enable */

  res.render('pages/year', {
    title: `Groundhog Day ${year}`,
    years,
    intro,
    predictions,
    predictionTotals,
    pageMeta: _getPageMeta(req, {
      description: `${intro.lead}. ${intro.predictionIntro} ${intro.predictionConclusion}.`,
      speakable: true,
    }),
  })
})

/* GET 2023 (upcoming) page */
/* ~@TODO: make this general. not hardcoded */
router.get('/groundhog-day-2023', function (req, res) {
  const predictionTotals = { years: 0, total: 0, winter: 0, spring: 0, null: 0 }
  let predictions = getPredictionsByYear(2022)
  predictions.forEach((prediction) => {
    ++predictionTotals['years']

    prediction['shadow'] === 1
      ? ++predictionTotals['winter'] && ++predictionTotals['total']
      : prediction['shadow'] === 0
      ? ++predictionTotals['spring'] && ++predictionTotals['total'] // eslint-disable-line indent
      : ++predictionTotals['null'] // eslint-disable-line indent
  })

  const predictionString =
    predictionTotals['winter'] > predictionTotals['spring'] ? 'a longer winter' : 'an early spring'

  const dateString = format(new Date('2023-02-02T00:00:00'), 'iiii, MMMM do')

  res.render('pages/groundhog-day-2023', {
    title: 'Groundhog Day 2023',
    dateString,
    daysLeft: _getDaysToGroundhogDay(),
    predictionString,
    pageMeta: _getPageMeta(req, {
      description: `In 2023, Groundhog Day will be on ${dateString}. Groundhog Day is not a statutory holiday in Canada or the USA.`,
      speakable: true,
    }),
  })
})

/* GET all groundhogs */
router.get(
  ['/groundhogs', '/groundhogs-in-canada', '/groundhogs-in-usa', '/alternative-groundhogs'],
  function (req, res) {
    const path = req.path.replace(/\/$/, '')
    /* eslint-disable indent */
    const country =
      path === '/groundhogs-in-canada'
        ? 'Canada'
        : path === '/groundhogs-in-usa'
        ? 'USA'
        : undefined
    /* eslint-enable */
    const isGroundhog = path === '/alternative-groundhogs' ? false : undefined

    let groundhogs = getGroundhogs({ year: CURRENT_YEAR, country, isGroundhog })

    // sort by most predictions to least predictions
    groundhogs.sort((a, b) => b.predictionsCount - a.predictionsCount)

    const recentPredictions = { total: 0, winter: 0, spring: 0 }
    const groundhogTypes = { groundhog: 0, other: 0 }
    groundhogs.forEach((g) => {
      ++recentPredictions['total']
      g['latestPrediction']['shadow']
        ? ++recentPredictions['winter']
        : ++recentPredictions['spring']

      g.type === 'Groundhog' ? ++groundhogTypes['groundhog'] : ++groundhogTypes['other']
    })

    /* eslint-disable indent */
    const pageTitle = path.includes('canada')
      ? 'Groundhogs in Canada'
      : path.includes('usa')
      ? 'Groundhogs in the USA'
      : path.includes('alternative')
      ? 'Alternative groundhogs'
      : 'Groundhogs'
    const nationality = path.includes('canada')
      ? 'Canadian '
      : path.includes('usa')
      ? 'American '
      : path.includes('alternative')
      ? 'non-traditional '
      : ''
    /* eslint-enable */

    res.render(`pages/${path.includes('alternative') ? '/groundhogs-alternative' : path}`, {
      title: pageTitle,
      groundhogs,
      groundhogTypes,
      recentPredictions: recentPredictions,
      pageMeta: _getPageMeta(req, {
        description: `See all ${groundhogs.length} ${nationality}prognosticators${
          path.includes('alternative')
            ? ' across Canada and the USA'
            : ', whether genuine groundhogs or otherwise'
        }. Despite the name, GROUNDHOG-DAY.com is all-welcoming.`,
      }),
    })
  },
)

const getGroundhogMetaDescription = (groundhog, { allPredictionsCount, firstYear } = {}) => {
  const modifier = aAnAre(groundhog.type) === 'is an' ? 'oracle' : 'prognosticating'
  let secondPhrase

  if (allPredictionsCount && firstYear) {
    const verb = groundhog.type.endsWith('hogs') ? 'have' : 'has'
    secondPhrase = ` ${groundhog.name} ${verb} made ${allPredictionsCount} predictions since ${firstYear}.`
  } else {
    const prediction =
      groundhog.predictions[0].shadow === 0
        ? 'predicted an early spring'
        : groundhog.predictions[0].shadow === 1
        ? 'predicted a longer winter' // eslint-disable-line indent
        : 'did not make a prediction' // eslint-disable-line indent

    secondPhrase = ` In ${CURRENT_YEAR}, ${groundhog.shortname} ${prediction}.`
  }

  return `${groundhog.name} ${aAnAre(groundhog.type)} ${modifier} ${groundhog.type} from ${
    groundhog.city
  } in ${groundhog.region}, ${groundhog.country}.${secondPhrase}`
}

/* GET single groundhog */
router.get('/groundhogs/:slug', validSlug, (req, res) => {
  const groundhog = getGroundhogBySlug(req.params.slug, { oldestFirst: false })
  let nullPredictions = 0
  groundhog.predictions.forEach((p) => p.shadow === null && ++nullPredictions)

  res.render('pages/groundhog', {
    title: groundhog.name,
    groundhog,
    allPredictions: groundhog.predictions.length - nullPredictions,
    year: CURRENT_YEAR,
    pageMeta: _getPageMeta(req, {
      description: getGroundhogMetaDescription(groundhog),
      slug: groundhog.slug,
      speakable: true,
    }),
  })
})

/* GET single groundhog */
router.get('/groundhogs/:slug/predictions', validSlug, (req, res) => {
  // years == all years (including nulls), total == all predictions (nulls are not included)
  let allPredictions = { years: 0, total: 0, shadow: 0, noShadow: 0, null: 0 }
  const oldestFirst = req.query.oldestFirst === 'true'

  let groundhog = getGroundhogBySlug(req.params.slug, { oldestFirst })
  groundhog['predictions'].forEach((p) => {
    ++allPredictions['years']

    p.shadow === 1
      ? ++allPredictions['shadow'] && ++allPredictions['total']
      : p.shadow === 0
      ? ++allPredictions['noShadow'] && ++allPredictions['total'] // eslint-disable-line indent
      : ++allPredictions['null'] // eslint-disable-line indent
  })

  const firstYear = oldestFirst
    ? groundhog.predictions[0].year
    : groundhog.predictions[groundhog.predictions.length - 1].year

  allPredictions = {
    ...allPredictions,
    percent: {
      shadow: getPercent(allPredictions.shadow, allPredictions.total),
      noShadow: getPercent(allPredictions.noShadow, allPredictions.total),
    },
  }

  res.render('pages/groundhog_predictions', {
    title: `${groundhog.shortname}’s Predictions`,
    groundhog,
    allPredictions,
    firstYear,
    oldestFirst,
    pageMeta: _getPageMeta(req, {
      description: getGroundhogMetaDescription(groundhog, {
        allPredictionsCount: allPredictions.total,
        firstYear,
      }),
      slug: groundhog.slug,
    }),
  })
})

// Import the express-openapi-validator library
const OpenApiValidator = require('express-openapi-validator')

const spec = path.join(__dirname, '../../reference/Groundhog-Day-API.v1.yaml')

APIRouter.use(
  OpenApiValidator.middleware({
    apiSpec: spec,
    validateRequests: true, // (default)
    validateResponses: true, // false by default
  }),
)

APIRouter.get('/', function (req, res) {
  res.json({
    message: 'Hello! Welcome to the Groundhog Day API: the leading Groundhog Day data source',
    _links: {
      self: { href: 'https://groundhog-day.com/api/v1/' },
      groundhogs: { href: 'https://groundhog-day.com/api/v1/groundhogs' },
      groundhog: { href: 'https://groundhog-day.com/api/v1/groundhogs/wiarton-willie' },
      predictions: { href: `https://groundhog-day.com/api/v1/predictions?year=${CURRENT_YEAR}` },
      spec: { href: 'https://groundhog-day.com/api/v1/spec' },
    },
  })
})

// Serve the OpenAPI spec
APIRouter.get('/spec', function (req, res) {
  res.download(spec, 'Groundhog-Day-API.v1.yaml')
})

/* get groundhogs as JSON */
APIRouter.get('/groundhogs', function (req, res) {
  let country = undefined
  if (req.query.country) {
    /* eslint-disable indent */
    country =
      req.query.country.toLowerCase() === 'canada'
        ? 'Canada'
        : req.query.country.toLowerCase() === 'usa'
        ? 'USA'
        : undefined
    /* eslint-enable */
  }

  const isGroundhog = parseBoolean(req.query.isGroundhog)
  const groundhogs = getGroundhogs({ oldestFirst: true, country, isGroundhog })
  res.json({ groundhogs })
})

/* get a single groundhog as JSON by id */
APIRouter.get('/groundhogs/:gId([0-9]{0,3})', validId, function (req, res) {
  const groundhog = getGroundhogById(req.params.gId, { oldestFirst: true })
  res.json({ groundhog })
})

/* get a single groundhog as JSON by slug */
APIRouter.get('/groundhogs/:slug', validSlug, function (req, res) {
  const groundhog = getGroundhogBySlug(req.params.slug, { oldestFirst: true })
  res.json({ groundhog })
})

/* get predictions for a single year as JSON */
APIRouter.get('/predictions', redirectYear, validYear, function (req, res) {
  let predictions = getPredictionsByYear(req.query.year)
  res.json({ predictions })
})

/* API not found error responses */
APIRouter.get('/*', (req, res) => {
  res.status(404)
  throw new createError(404, `Error: Could not find route “${req.path}”`)
})

// eslint-disable-next-line no-unused-vars
APIRouter.use(function (err, req, res, next) {
  const status = err.status || res.statusCode
  return res.status(status).send({
    error: {
      status,
      message: err.toString() || err.message,
      timestamp: new Date(Date.now()).toISOString(),
    },
  })
})

module.exports = { router, APIRouter }
