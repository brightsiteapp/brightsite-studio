import businessLookup from './_lib/lookups/business-lookup.js';
import checkDomain from './_lib/lookups/check-domain.js';
import facebookLookup from './_lib/lookups/facebook-lookup.js';
import placeAutocomplete from './_lib/lookups/place-autocomplete.js';
import placePhoto from './_lib/lookups/place-photo.js';

// One function serves the old /api/<name> URLs (rewritten in vercel.json) to stay under Vercel Hobby's 12-function limit.
const ROUTES = {
  'business-lookup': businessLookup,
  'check-domain': checkDomain,
  'facebook-lookup': facebookLookup,
  'place-autocomplete': placeAutocomplete,
  'place-photo': placePhoto,
};

export default function handler(req, res) {
  const route = ROUTES[req.query?.fn];
  if (!route) return res.status(404).json({ error: 'Not found' });
  delete req.query.fn;
  return route(req, res);
}
