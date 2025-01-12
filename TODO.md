TODO

- "data" seo
- Data as CSV
- Stretch goal: was that an accurate prediction for that year?
- More tests
- Groundhog day countdown timer better + with marquee
- Ideas from Julia
  - Countdown page
  - Groundhog nearest to you
  - Page of the most out-there facts
- Sortable tables
  - Accessible announcements of how many results for a search
- Add RichResults
  - Dataset lol

DONE

- Create pages allowing viewing non-traditional groundhogs
  - Updated the API to allow "isGroundhog" query param for groundhogs retrieval
  - Updated breadcrumbs to show "/groundhogs" as parent page of derived pages
- Skip link
- Add an intro sentence on the index page.
- Add RichResults
  - Breadcrumbs
  - Speakable
- Create pages allowing viewing groundhogs by country of origin
  - Updated the API to allow "country" query param for groundhogs retrieval
- Add About page to the nav
- Fix up the API schema
  - Use API schema to validate API responses
  - Write more tests for the API responses
  - Download the .yaml file with a filename
  - All API responses now start with an object name
- Turn off request logs during testing
- Add a robots.txt file
- Do a smartbear API schema
  - Return API error messages as JSON, not HTML
  - Update the documentation for the API
- Add groundhog day header back on mobile
  - Also add a tagline
- Smaller fullscreen logo: don't want it arguing with the H1
- Update the README
- "Final" groundhogs page
- Bugfix: Don't show predictions grid for years with no predictions
- Unit tests for allowable years
- Bugfix: Fix upcoming year sorting in the Predictions table
- Shorten the "Add" instructions
- Year pages redux
  - Change title and h1
  - Add top-line sentence
  - Make sure it is in meta tag
  - Add upcoming year
- Sortable tables
  - All groundhogs: sort by heading
  - All groundhogs: reverse the "count" table header sort
  - Search all groundhogs
  - All predictions: sort by heading
  - All years: sort by heading
  - One year: sort by name, prediction
  - Keyboard controls for table heading sorts
- Bugfix: add root API response and don't return strings in JSON
- Bugfix: fix up HTML validation errors
- Bugfix: use https and remove query params for canonical urls
- Sitemap
- Revisit menu
  - Mobile menu has less wasted space and it is way easier to go home
  - Let's just go for it: removing the header on mobile #yolo
- Add Poppy the Groundhog
- Add a(n) (optional) contact field to groundhogs
- Remove the "don't index me" stuff
- Analytics
- Credit Tyler Benning
- Actual explanation of groundhog day
- CORS
- Images & <meta> stuff
  - Add generic meta image for non-groundhog pages
  - Add description
  - Add title, sitemap, author, link
  - Fix layout glitch
  - Check all images show up
  - Compress images
  - Social share images
  - Get specific image sizes for groundhogs
- Don't total predictions minus the nulls
- Rearrange data
  - Predictions years
  - Groundhogs on groundhogs page
  - Groundhogs on years page
- Fix "no prediction" count in the individual year page
- Get it deployed with the URL
- Fill the nulls in the prediction years
- Find a little more data
- Add a Groundhog (basically, a google form)
- Add identifier for non-groundhogs
- Highlight menu items when selected
- New rule, groundhog identifiers are slugs
  - Switch this in API
  - Switch in URLs
  - Rewrite importer
  - Expect images to be the same
- Mobile menu
- Arrows in links, use icons
  - Download icon for the button
- Page: All predictions by year
- Home page:
  - Days left
  - This year's prediction
  - "Cards" for years
  - "Cards" for groundhogs
- Refactor Database calls: less in-app stuff, more complete queries
- Page: This year's prediction
  - MVP navigation between pages
  - New element, the groundhog box
- Page titles
- "final" groundhog page
  - new callout
  - new media object
  - new layout
- Smaller headings for less abrupt font changes
  - All tables have headings now
- Clean up API and About pages
- Back to top link
- Get the data, simpler
- Page: API
- API route to get predictions by year
- Mobile layout
  - Menu
  - Header
  - Tables
  - Fonts
- Page: About
- Generic 404 page
  - Get rid of 404 errors
- Add Github hash as part of auto deploy
- Security headers
- Github actions autodeploy
- Create an actual API
- Buttons for CSV and API
- Arrows in links, hide them
- "current" in the nav
- Sort out the product page
- Focus styles
- Nunjucks filter to clean up urls
- Create the homepage
- Images for groundhogs
- Favicon
- Set up sass
- Create a product page (product == groundhog)
- Create a "groundhogs" page
- Normalize or reset or whatever we do now
- Add logo
- Deploy it
- Get a dockerfile
- Show some pages
- Build some basic routing
- Get some groundhogs
- Show some predictions
