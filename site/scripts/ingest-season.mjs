import {fetchSeason} from '../lib/f1-source.mjs';
const year=Number(process.argv[2]);
if(!Number.isInteger(year)||year<1950||year>9999)throw new Error('Invalid season year');
process.stdout.write(JSON.stringify(await fetchSeason(year)));
