
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const pool = require("./db");

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
secret: process.env.SESSION_SECRET,
resave: false,
saveUninitialized: false,
cookie: {
httpOnly: true,
sameSite: "lax"
}
}));

function requireLogin(req, res, next) {
if (!req.session.user) {
return res.redirect("/signin");
}
next();
}


app.get("/", async (req, res) => {
try {
const result = await pool.query(
"SELECT * FROM blogs ORDER BY date_created DESC, blog_id DESC"
);

res.render("index", {
posts: result.rows,
user: req.session.user || null
});
} catch (error) {
console.error(error);
res.status(500).send("Error loading blog posts.");
}
});


app.get("/signup", (req, res) => {
res.render("signup", { error: null });
});


app.post("/signup", async (req, res) => {
const { name, user_id, password } = req.body;

if (!name || !user_id || !password || password.length < 8) {
return res.status(400).render("signup", {
error: "Please complete all fields. Password must be at least 8 characters."
});
}

try {
const existing = await pool.query(
"SELECT user_id FROM users WHERE user_id = $1",
[user_id]
);

if (existing.rows.length > 0) {
return res.status(400).render("signup", {
error: "That username is already taken."
});
}

const hashedPassword = await bcrypt.hash(password, 12);

await pool.query(
"INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)",
[user_id, hashedPassword, name]
);

res.redirect("/signin");
} catch (error) {
console.error(error);
res.status(500).send("Error creating account.");
}
});


app.get("/signin", (req, res) => {
res.render("signin", { error: null });
});


app.post("/signin", async (req, res) => {
const { user_id, password } = req.body;

try {
const result = await pool.query(
"SELECT * FROM users WHERE user_id = $1",
[user_id]
);

if (result.rows.length === 0) {
return res.status(401).render("signin", {
error: "Invalid username or password."
});
}

const user = result.rows[0];
const validPassword = await bcrypt.compare(password, user.password);

if (!validPassword) {
return res.status(401).render("signin", {
error: "Invalid username or password."
});
}

req.session.regenerate((error) => {
if (error) {
console.error(error);
return res.status(500).send("Error signing in.");
}

req.session.user = {
user_id: user.user_id,
name: user.name
};

req.session.save((error) => {
if (error) {
console.error(error);
return res.status(500).send("Error saving login.");
}
res.redirect("/");
});
});
} catch (error) {
console.error(error);
res.status(500).send("Error signing in.");
}
});


app.post("/logout", (req, res) => {
req.session.destroy((error) => {
if (error) {
return res.status(500).send("Error signing out.");
}
res.clearCookie("connect.sid");
res.redirect("/");
});
});


app.post("/posts", requireLogin, async (req, res) => {
const { title, content } = req.body;
const user = req.session.user;

if (!title || !content || !title.trim() || !content.trim()) {
return res.status(400).send("Title and content are required.");
}

try {
await pool.query(
"INSERT INTO blogs (creator_name, creator_user_id, title, body) VALUES ($1, $2, $3, $4)",
[user.name, user.user_id, title.trim(), content.trim()]
);

res.redirect("/");
} catch (error) {
console.error(error);
res.status(500).send("Error creating post.");
}
});


app.get("/posts/:id/edit", requireLogin, async (req, res) => {
try {
const result = await pool.query(
"SELECT * FROM blogs WHERE blog_id = $1 AND creator_user_id = $2",
[req.params.id, req.session.user.user_id]
);

if (result.rows.length === 0) {
return res.status(404).send("Post not found or access denied.");
}

res.render("edit", {
post: result.rows[0],
user: req.session.user
});
} catch (error) {
console.error(error);
res.status(500).send("Error loading post.");
}
});


app.post("/posts/:id/edit", requireLogin, async (req, res) => {
const { title, content } = req.body;

if (!title || !content || !title.trim() || !content.trim()) {
return res.status(400).send("Title and content are required.");
}

try {
const result = await pool.query(
"UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3 AND creator_user_id = $4 RETURNING blog_id",
[title.trim(), content.trim(), req.params.id, req.session.user.user_id]
);

if (result.rows.length === 0) {
return res.status(404).send("Post not found or access denied.");
}

res.redirect("/");
} catch (error) {
console.error(error);
res.status(500).send("Error updating post.");
}
});


app.post("/posts/:id/delete", requireLogin, async (req, res) => {
try {
const result = await pool.query(
"DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2 RETURNING blog_id",
[req.params.id, req.session.user.user_id]
);

if (result.rows.length === 0) {
return res.status(404).send("Post not found or access denied.");
}

res.redirect("/");
} catch (error) {
console.error(error);
res.status(500).send("Error deleting post.");
}
});


app.listen(PORT, () => {
console.log(`Server running at http://localhost:${PORT}`);
});
