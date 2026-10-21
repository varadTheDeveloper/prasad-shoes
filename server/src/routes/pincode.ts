import { Router } from 'express';
import { z } from 'zod';
import { h } from '../errors';
import { checkPincode } from '../services/pincode';

const r = Router();

const body = z.object({
  pincode: z.string().max(12),
  address: z.string().max(2000).nullish(),
  landmark: z.string().max(500).nullish(),
  district: z.string().max(200).nullish(),
  state: z.string().max(100).nullish(),
});

/** POST /api/pincode/check – district / state of a pincode plus warnings (never blocks saving). */
r.post(
  '/check',
  h(async (req, res) => {
    const b = body.parse(req.body ?? {});
    res.json(checkPincode(b));
  }),
);

export default r;
