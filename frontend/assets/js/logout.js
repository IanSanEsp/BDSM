document.addEventListener("DOMContentLoaded", () => {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("loggedUser");
        localStorage.removeItem("isAdmin");
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");

        window.location.href = "btzLogin.html";
    });
});
