import type { ViewOverrides } from "@/views";

// This client's own views. Each key is the name of one of the kit's views
// (src/views/kit.ts) and the value is the component shown in its place; it
// gets the same props. A view that is not listed is the kit's.
//
//   import Home from "./views/home";
//   const views: ViewOverrides = { "site.home": Home };
//
// Keep this client's components in theme/views/. They read the core through
// its functions (src/core) and may reuse the kit's parts (src/views/parts).

const views: ViewOverrides = {};

export default views;
