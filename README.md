##NodeJS scrapper. Collects members' data from [sia.ch  ](sia.ch)

Experimental scrapper in NodeJS. Uses phantomJS and cheerio to process and parse web
content.
Some configuration options are available via [config.json](config.json)  

Performance results obtained on previous runs can be seen in [metrics.json](metrics.json)  
On average, on my machine with 4 CPU cores, it takes about 70 minutes to scrape all ~15K members.  
Theoretically, the more cores a machine has the faster the results will be gathered.
