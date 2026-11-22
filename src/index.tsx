import { render } from "solid-js/web";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/features.css";
import "./styles/mobile.css";
import "katex/dist/katex.min.css";
import { App } from "./App";
import { initSettings } from "./state/settings";
import { initVoice } from "./a11y/voice";

const root = document.getElementById("root");
if (root) {
  void initSettings().finally(() => {
    initVoice();
    render(() => <App />, root);
  });
}
