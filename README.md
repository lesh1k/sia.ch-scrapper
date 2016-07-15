##NodeJS scrapper. Collects members' data from [sia.ch  ](sia.ch)

Experimental scrapper in NodeJS. Uses phantomJS and cheerio to process and parse web
content.
Some configuration options are available via [config.json](config.json)  

Performance results obtained on previous runs can be seen in [metrics.json](metrics.json)  
On average, on my machine with 4 CPU cores, it takes about 70* minutes to scrape all ~15K members.  
Theoretically, the more cores a machine has the faster the results will be gathered.


*NOTE: it takes so long to process each member because member contact details have to be decrypted and this is done via JS, thus JS has to be executed. If contact details are left aside, parse times for each member could be reduced by at least 200ms, thus resulting in overall faster results retrieval (appx by a total of 15000 x 200 = 3 000 000ms = 50min, 50/4 workers = 12.5min per worker gain)
