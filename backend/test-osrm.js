const axios = require('axios');

async function test() {
  const url = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/77.59,12.97;77.58,12.96?overview=full&geometries=geojson&alternatives=true';
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': 'GreenCorridorApp/1.0' }});
    console.log('Routes found:', res.data.routes.length);
    console.log('Distances:', res.data.routes.map(r => r.distance));
  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) console.error(e.response.data);
  }
}

test();
