import { describe as suite, expect, it } from "vitest";
import { describe, markdownToSpeech, voiceFor } from "./speech";

const v = (lang: string, localService = true, isDefault = false) => ({ lang, localService, default: isDefault, name: lang });

suite("voiceFor", () => {
  const list = [v("en-US", false), v("en-GB"), v("fa-IR"), v("pt-PT"), v("pt-BR"), v("zh-CN", true, true)];
  it("matches exact language, then base language, offline voices only", () => {
    expect(voiceFor("pt-BR", list)?.lang).toBe("pt-BR");
    expect(voiceFor("fa", list)?.lang).toBe("fa-IR");
    expect(voiceFor("en", list)?.lang).toBe("en-GB");
    expect(voiceFor("zh", list)?.lang).toBe("zh-CN");
    expect(voiceFor("ar", list)).toBeNull();
  });
});

suite("describe", () => {
  it("reads name, role and state of controls", () => {
    document.body.innerHTML = `
      <button id="b" aria-pressed="true">Bold</button>
      <label for="c">Reduce motion</label><input id="c" type="checkbox" checked>
      <div id="t" role="treeitem" aria-expanded="false" aria-selected="true"><span>Projects</span></div>
      <input id="r" type="range" aria-label="Blur" value="12">`;
    const get = (id: string) => document.getElementById(id)!;
    expect(describe(get("b"))).toEqual({ name: "Bold", role: "button", states: ["pressed"], value: undefined });
    expect(describe(get("c"))).toMatchObject({ name: "Reduce motion", role: "checkbox", states: ["checked"] });
    expect(describe(get("t"))).toMatchObject({ name: "Projects", role: "treeitem", states: ["collapsed", "selected"] });
    expect(describe(get("r"))).toMatchObject({ name: "Blur", role: "slider", value: "12" });
  });
});

suite("markdownToSpeech", () => {
  it("drops syntax, front matter and code", () => {
    const src = "---\ntags: [a]\n---\n# Title\n\nSee [[Note|the note]] and **bold** `x`.\n\n```js\ncode()\n```\n- [ ] task";
    expect(markdownToSpeech(src)).toBe("Title. See the note and bold x. task");
  });
});
