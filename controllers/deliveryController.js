const pool = require("../utils/db");
const { NIGERIAN_STATES, pickupAddress } = require("../utils/delivery");

const back = (res, error) =>
  res.redirect("/admin/delivery" + (error ? "?error=" + encodeURIComponent(error) : ""));

function zoneParams(body) {
  const states = (Array.isArray(body.states) ? body.states : body.states ? [body.states] : [])
    .filter(s => NIGERIAN_STATES.includes(s));
  const num = v => (v === "" || v == null ? null : Number(v));
  return {
    name: String(body.name || "").trim(),
    states,
    fee: num(body.fee) ?? 0,
    free_over: num(body.free_over),
    eta: String(body.eta || "").trim() || null,
    is_active: body.is_active === "on" || body.is_active === "true",
  };
}

async function validate(p, id = null) {
  if (!p.name) return "Zone name is required";
  if (!(p.fee >= 0)) return "Fee must be 0 or more";
  if (p.free_over != null && !(p.free_over > 0)) return "Free-delivery threshold must be more than 0";

  const current = id ? (await pool.query("SELECT is_default FROM delivery_zones WHERE id = $1", [id])).rows[0] : null;
  if (!current?.is_default && !p.states.length) return "Pick at least one state for this zone";

  // A state can only belong to one zone
  const clash = await pool.query(
    `SELECT name, ARRAY(SELECT unnest(states) INTERSECT SELECT unnest($1::text[])) AS overlap
     FROM delivery_zones WHERE ($2::int IS NULL OR id <> $2) AND states && $1::text[]`,
    [p.states, id]
  );
  if (clash.rows.length) {
    const c = clash.rows[0];
    return `${c.overlap.join(", ")} already belong${c.overlap.length === 1 ? "s" : ""} to "${c.name}"`;
  }
  return null;
}

exports.list = async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM delivery_zones ORDER BY is_default ASC, name ASC");
    const assigned = new Map();
    rows.filter(z => !z.is_default).forEach(z => (z.states || []).forEach(s => assigned.set(s, z.name)));
    res.render("admin/delivery", {
      title: "Delivery | JKT E-Commerce",
      zones: rows,
      states: NIGERIAN_STATES,
      assigned: Object.fromEntries(assigned),
      pickup: pickupAddress(),
      error: req.query.error || null,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error loading delivery zones:", err);
    res.status(500).send("Server error");
  }
};

exports.create = async (req, res) => {
  const p = zoneParams(req.body);
  const error = await validate(p);
  if (error) return back(res, error);
  try {
    await pool.query(
      "INSERT INTO delivery_zones (name, states, fee, free_over, eta, is_active) VALUES ($1,$2,$3,$4,$5,$6)",
      [p.name, p.states, p.fee, p.free_over, p.eta, p.is_active]
    );
    back(res);
  } catch (err) {
    console.error("Error creating zone:", err);
    back(res, "Could not create zone");
  }
};

exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = zoneParams(req.body);
  const error = await validate(p, id);
  if (error) return back(res, error);
  try {
    // The default zone always covers "everywhere else", so it keeps no states and stays active
    await pool.query(
      `UPDATE delivery_zones SET name=$1, fee=$3, free_over=$4, eta=$5,
         states = CASE WHEN is_default THEN '{}' ELSE $2 END,
         is_active = CASE WHEN is_default THEN true ELSE $6 END
       WHERE id=$7`,
      [p.name, p.states, p.fee, p.free_over, p.eta, p.is_active, id]
    );
    back(res);
  } catch (err) {
    console.error("Error updating zone:", err);
    back(res, "Could not update zone");
  }
};

exports.remove = async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM delivery_zones WHERE id = $1 AND is_default = false", [req.params.id]);
    back(res, rowCount ? null : "The default zone can't be deleted — edit its fee instead");
  } catch (err) {
    console.error("Error deleting zone:", err);
    back(res, "Could not delete zone");
  }
};
