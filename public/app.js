const socket = io()

const inp = document.getElementById("in")
const btn = document.getElementById("btn")
const messages = document.getElementById("messages")
const chatMessages = []

function renderMessages() {
    messages.innerHTML = ""
    chatMessages.forEach((item) => {
        const div = document.createElement("div")
        div.className = `message-bubble${item.isMine ? " me" : ""}`
        div.textContent = item.text
        messages.appendChild(div)
    })
    messages.scrollTop = messages.scrollHeight
}

function addMessage(msg, isMine = false) {
    const messageText = typeof msg === "string" ? msg : msg?.message ?? ""
    const uniqueKey = typeof msg === "string"
        ? `text:${messageText}`
        : (msg?._id || msg?.id || `text:${messageText}`)

    if (!messageText) return

    const exists = chatMessages.some((item) => item.id === uniqueKey)
    if (exists) return

    chatMessages.push({ id: uniqueKey, text: messageText, isMine })
    renderMessages()
}

async function apicall() {
    chatMessages.length = 0
    renderMessages()

    const get = await fetch("http://localhost:5000/api")
    const promises = await get.json()
    console.log("promises==>", promises)

    promises.forEach((item) => {
        addMessage({ message: item.message, _id: item._id }, false)
    })
}

apicall()

btn.addEventListener("click", async () => {
    const message = inp.value.trim()
    if (!message) return

    inp.value = ""

    const api = "http://localhost:5000/api"
    const promises = await fetch(api, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
    })

    const resolve = await promises.json()
    console.log("resolve==>", resolve)

    const savedMessage = resolve?.data
    if (savedMessage) {
        addMessage({ message: savedMessage.message, _id: savedMessage._id }, true)
        socket.emit("message", { message: savedMessage.message, _id: savedMessage._id })
    } else {
        addMessage({ message }, true)
        socket.emit("message", message)
    }
})

socket.on("user-message", (data) => {
    console.log("app ka ==>", data)
    const payload = typeof data === "string"
        ? { message: data, _id: `socket:${data}` }
        : data
    addMessage(payload, false)
})

