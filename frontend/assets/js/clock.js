function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString("es-MX", { hour12: false });

    // Main header/user-section clock
    const headerClock = document.getElementById("clock");
    if (headerClock) headerClock.textContent = timeString;

    // Map page clock
    const mapClock = document.getElementById("mapClock");
    if (mapClock) mapClock.textContent = timeString;
}

setInterval(updateClock, 1000);
updateClock();
