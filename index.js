'use strict';
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const cors = require('cors');
const compression = require('compression');
const HTMLParser = require('node-html-parser');
const d3 = require('d3-dsv');

const port = parseInt(process.env.PORT, 10) || 3001;

const nameStandards = {
  "Mainland China":"China",
  "US":"USA",
  "United States":"USA",
  "United Kingdom":"UK",
  "England":"UK",
  "Others":"Diamond Princess",
  "Cruise Ship":"Diamond Princess",
  "Czechia":"Czech Republic",
  "United Arab Emirates":"UAE",
  "Iran (Islamic Republic of)":"Iran",
  "Hong Kong SAR":"Hong Kong",
  "Viet Nam":"Vietnam",
  "occupied Palestinian territory":"Palestine",
  "Macao SAR":"Macao",
  "Russian Federation":"Russia",
  "Republic of Moldova":"Moldova",
  "Macedonia":"North Macedonia",
  "Republic of Serbia":"Serbia",
  "Saint Vincent and the Grenadines":"St. Vincent Grenadines",
  "Ivory Coast":"Cote d'Ivoire",
  "Saint Barthelemy":"St. Barth",
  "Faroe Islands":"Faeroe Islands",
  "Faeroe Islands":"Faeroe Islands",
  "Runion":"Reunion",
  "The Gambia":"Gambia",
  "Central African Republic":"CAR",
  "Curacao":"Curaao",
  "Curaao":"Curaao",
  "Jersey":"Channel Islands",
  "Guernsey":"Channel Islands",
  "East Timor":"Timor-Leste",
  "Republic of Korea":"South Korea",
  "S. Korea":"South Korea",
  "Korea, South":"South Korea",
  "United Republic of Tanzania":"Tanzania",
  "Holy See":"Vatican City",
  "Vatican":"Vatican City",
  "Holy See (Vatican City State)":"Vatican City",
  "Taiwan*":"Taiwan",
  "Taipei and environs":"Taiwan",
  "Democratic Republic of Congo":"Congo",
  "Congo (Kinshasa)":"Congo",
  "DRC":"Congo",
  "The Democratic Republic of Congo":"Congo",
  "Democratic Republic of the Congo":"Congo",
  "Congo (Brazzaville)":"Congo (Brazzaville)",
  "The Bahamas":"Bahamas",
  "Bahamas, The":"Bahamas",
  "Gambia, The":"Gambia"
};

const sanitizeNumber = number => parseInt(number.replace(/,/g, '')) || 0;

const getTodayData = (element) => {
  const rows = element.querySelectorAll('#main_table_countries_today tr') || [];
  const result = rows
    .map(d => d.text)
    .map(d => 
      d.split('\n').map(t => t.split('\t').map(d => d.trim())
    ).flat().filter((d, i) => i))
    .map(d => ({
      country: nameStandards[d[1]] || d[1],
      confirmed: sanitizeNumber(d[2]),
      deaths: sanitizeNumber(d[4]),
      recovered: sanitizeNumber(d[6]),
    }));

  // const worldRows = element.querySelectorAll('.maincounter-number') || [];
  // result.unshift({
  //   country: 'World',
  //   confirmed: sanitizeNumber((worldRows[0] || {}).text || ''),
  //   deaths: sanitizeNumber((worldRows[2] || {}).text || ''),
  //   recovered: sanitizeNumber((worldRows[1] || {}).text || ''),
  // });
  
  return result;
};

const whitelist = ['http://localhost:3000', 'https://coronavirus-live.org'];
// const corsOptions = {
//   origin: function (origin, callback) {
//     if (whitelist.indexOf(origin) !== -1 || !origin) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   }
// };

app.use(compression());

app.get('/', cors(), (req, res) => {
  const msg = whitelist.indexOf(req.get('origin')) === -1 ? 'External request from' : 'Request from';
  console.log(msg, req.get('origin'), Date.now());

  if (!historyData) {
    cronJob();
    setInterval(() => {
      cronJob();
    }, 300000); // Every 5 minutes
    res.send('NOT_READY');
  } else {
    res.send(historyData);
  }
});

let lastHistoryFetch;
let historyData;
const fetchHistoryData = () => {
  if (historyData && Date.now() - lastHistoryFetch < 7200000) { // less than two hours
    return;
  }

  lastHistoryFetch = Date.now();
  console.log('Fetching historyData', lastHistoryFetch);
  const BASE_URL = 'https://raw.githubusercontent.com/bumbeishvili/covid19-daily-data/master/time_series_19-covid';
  const NUM_DATE = 27;
  return Promise.all(['Confirmed', 'Deaths', 'Recovered'].map(name =>
    fetch(`${BASE_URL}-${name}.csv`).then(resp => resp.text())
  )).then(texts => {
    const [confirmedRawData, deathsRawData, recoveredRawData] = texts;
    const confirmedData = d3.csvParse(confirmedRawData);
    const deathsData = d3.csvParse(deathsRawData);
    const recoveredData = d3.csvParse(recoveredRawData);

    const dateKeys = Object.keys(confirmedData[0]).filter(k => !'Province/StateCountry/RegionLatLong'.includes(k)).slice(-NUM_DATE); // Take last 2 weeks
    const result = {
      World: {},
      dateList: [...dateKeys, 'Now'],
    };
    
    for (let i = 0; i < confirmedData.length; i += 1) {
      const { 'Province/State': provinceState, 'Country/Region': countryRegion, Lat: lat, Long: long } = confirmedData[i];
      const country = countryRegion;
      const state = provinceState === country ? `${country} - Mainland` : provinceState;
      
      for (let j = 0; j < dateKeys.length; j += 1) {
        const currentDate = dateKeys[j];
        const newData = { // Not sure country or state
          confirmed: sanitizeNumber(confirmedData[i][currentDate]),
          deaths: sanitizeNumber(deathsData[i][currentDate]),
          recovered: sanitizeNumber(recoveredData[i][currentDate]),
        };

        // Aggregate World data
        const currentDateWorldData = result.World[currentDate];
        if (currentDateWorldData) {
          currentDateWorldData.confirmed += newData.confirmed;
          currentDateWorldData.deaths += newData.deaths;
          currentDateWorldData.recovered += newData.recovered;
        } else {
          result.World[currentDate] = newData;
        }

        const objKey = state || country;
        const isState = !!state;

        // Save this state/country anyway
        if (result[objKey]) { // If the key was added
          result[objKey][currentDate] = {
            ...newData,
          };
        } else { // If not, create new key with lat, long, isState
          result[objKey] = {
            [currentDate]: {
              ...newData,
            },
            lat,
            long,
            isState,
            country,
          }
        }

        // Update country data
        if (isState) { // If this is a state, then check the country
          if (result[country]) { // If its country was added
            const existindDateData = result[country][currentDate];
            if (existindDateData) { // If data for current date
              existindDateData.confirmed += newData.confirmed;
              existindDateData.deaths += newData.deaths;
              existindDateData.recovered += newData.recovered;
            } else { // If not, add new date
              result[country][currentDate] = {
                confirmed: newData.confirmed,
                deaths: newData.deaths,
                recovered: newData.recovered,
              };
            }
          } else { // Add new country
            result[country] = {
              country,
              isState: false,
              [currentDate]: {
                confirmed: newData.confirmed,
                deaths: newData.deaths,
                recovered: newData.recovered,
              }
            };
          }
        }
      }
    }

    historyData = result;
  });
}

let todayData;
const cronJob = async () => {
  console.log('Running job', Date.now());
  await fetchHistoryData();

  fetch('https://www.worldometers.info/coronavirus/')
    .then(res => res.text())
    .then(body => {
      const dom = HTMLParser.parse(body, {
        script: false,
        style: false,
        pre: false,
        comment: false
      });
      todayData = getTodayData(dom);
      if (historyData) {
        todayData.forEach(item => {
          if (historyData[item.country]) {
            historyData[item.country].Now = {
              confirmed: item.confirmed,
              deaths: item.deaths,
              recovered: item.recovered,
            };
          }
        });
      }
    });
};

app.listen(port, (err) => {
  if (err) throw err;
  console.log(`> Ready on http://localhost:${port}`);
  cronJob();
  setInterval(() => {
    cronJob();
  }, 300000); // Every 5 minutes
});
