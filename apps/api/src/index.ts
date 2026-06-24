import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "@repo/db";
import { CreateUserSchema, formatDate, capitalize } from "@repo/shared";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: formatDate(new Date()) });
});

// Users listing route
app.get("/users", async (req, res) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// User creation route
app.post("/users", async (req, res) => {
  try {
    // Validate request using shared Zod schema
    const parseResult = CreateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors });
      return;
    }

    const { email, name } = parseResult.data;
    const formattedName = name ? capitalize(name) : undefined;

    const user = await db.user.create({
      data: {
        email,
        name: formattedName,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error("Failed to create user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.listen(port, () => {
  console.log(`API server is running at http://localhost:${port}`);
});
