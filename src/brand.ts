import client from "../client.json";
import type { Client } from "./brand.schema";

// The one place the client's name, wording and look come from: client.json.
// Plain data with no other imports, so pages, browser code, the worker and the
// scripts can all read it. The colours and fonts reach the stylesheet through
// src/app/brand.css, which `pnpm brand` writes from the same file.
const checked = client as Client;

export const brand = checked.brand;
export const theme = checked.theme;
