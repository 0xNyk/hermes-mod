module.exports = {
  version: "6.0",
  title: "Hermes Mod",
  description: "Server-backed Hermes skin manager with live preview and one-click activation.",
  icon: "nous.jpeg",
  menu: async (kernel, info) => {
    const installed = info.exists("app/node_modules")
    const running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      reset: info.running("reset.js")
    }

    if (running.install) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.js"
      }]
    }

    if (!installed) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.js"
      }]
    }

    if (running.start) {
      const local = info.local("start.js")
      if (local && local.url) {
        return [{
          default: true,
          icon: "fa-solid fa-wand-magic-sparkles",
          text: "Open Hermes Mod",
          href: local.url
        }, {
          icon: "fa-solid fa-terminal",
          text: "Server Terminal",
          href: "start.js"
        }, {
          icon: "fa-solid fa-plug",
          text: "Update",
          href: "update.js"
        }, {
          icon: "fa-regular fa-circle-xmark",
          text: "Reset",
          href: "reset.js"
        }]
      }
      return [{
        default: true,
        icon: "fa-solid fa-terminal",
        text: "Server Terminal",
        href: "start.js"
      }]
    }

    if (running.update) {
      return [{
        default: true,
        icon: "fa-solid fa-terminal",
        text: "Updating",
        href: "update.js"
      }]
    }

    if (running.reset) {
      return [{
        default: true,
        icon: "fa-solid fa-terminal",
        text: "Resetting",
        href: "reset.js"
      }]
    }

    return [{
      default: true,
      icon: "fa-solid fa-power-off",
      text: "Start",
      href: "start.js"
    }, {
      icon: "fa-solid fa-plug",
      text: "Update",
      href: "update.js"
    }, {
      icon: "fa-solid fa-plug",
      text: "Install",
      href: "install.js"
    }, {
      icon: "fa-regular fa-circle-xmark",
      text: "Reset",
      href: "reset.js"
    }]
  }
}
