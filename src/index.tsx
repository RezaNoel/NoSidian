import { render } from "solid-js/web";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import { App } from "./App";
import { initSettings } from "./state/settings";

const root = document.getElementById("root");
if (root) {
  void initSettings().finally(() => render(() => <App />, root));
}
