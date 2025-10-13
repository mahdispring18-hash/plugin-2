
<?php if ( ! defined( 'ABSPATH' ) ) exit; ?>
<!-- TailwindCSS CDN -->
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">

<!-- Inline styles moved to assets/css/bkja-frontend.css - keep JS unchanged -->

<!-- Crisp-style Chat Launcher -->
<div id="bkja-chat-launcher" class="fixed bottom-8 right-8 z-[99999]">
  <button id="bkja-launcher-btn" class="rounded-full shadow-lg bg-gradient-to-br from-blue-400 to-blue-600 hover:scale-105 transition-transform duration-200 p-2 w-14 h-14 flex items-center justify-center">
    <span class="">
      <!-- پیام آیکون SVG -->
      <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="14" fill="#1e90ff"/>
        <path d="M8 12.5C8 11.1193 9.11929 10 10.5 10H17.5C18.8807 10 20 11.1193 20 12.5V15.5C20 16.8807 18.8807 18 17.5 18H10.5C9.11929 18 8 16.8807 8 15.5V12.5Z" fill="white"/>
        <path d="M10.5 10C9.11929 10 8 11.1193 8 12.5V15.5C8 16.8807 9.11929 18 10.5 18H17.5C18.8807 18 20 16.8807 20 15.5V12.5C20 11.1193 18.8807 10 17.5 10H10.5Z" stroke="#1e90ff" stroke-width="1.5"/>
      </svg>
    </span>
  </button>
  <div id="bkja-launcher-welcome" class="absolute right-0 bottom-20 bg-white/60 backdrop-blur-lg rounded-xl shadow-lg px-4 py-2 text-gray-800 text-base font-semibold border border-white/30">سلام 👋 من دستیار شغلی هستم. چطور می‌تونم کمکتون کنم؟</div>
</div>

<!-- Chat Panel (hidden by default) -->
<div id="bkja-chatbox" class="bkja-container bkja-panel-hidden fixed bottom-8 right-8 z-[99998] w-full max-w-md bg-white/60 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/30 flex flex-col overflow-hidden">
  <div class="bkja-header flex items-center justify-between px-6 py-4 bg-white/70 rounded-t-2xl border-b border-white/20">
    <strong class="bkja-title text-lg font-bold text-blue-700"><?php echo esc_html( $atts['title'] ?? __( 'دستیار شغلی', 'bkja-assistant' ) ); ?></strong>
    <div class="bkja-header-btns flex gap-2">
      <button id="bkja-menu-toggle" class="bkja-menu-toggle text-xl text-blue-500 hover:text-blue-700 transition" aria-expanded="false" aria-controls="bkja-menu-panel">☰</button>
      <button id="bkja-close-panel" class="bkja-close-panel text-xl text-gray-500 hover:text-red-500 transition" aria-label="بستن چت">✖</button>
    </div>
  </div>

  <div id="bkja-menu-panel" class="bkja-menu-panel absolute top-0 left-0 w-full h-full bg-white/60 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/30 hidden flex-col z-50 p-0">
    <button class="bkja-close-menu absolute top-4 left-4 text-lg text-gray-500 hover:text-red-500 transition" aria-label="<?php esc_attr_e('Close menu','bkja-assistant'); ?>">✖</button>
    <div class="bkja-menu-content flex-1 overflow-y-auto px-6 py-4">
      <div class="bkja-menu-section bkja-profile-section mb-6">
        <h4 class="bkja-menu-title text-base font-semibold text-blue-700 mb-2">پروفایل</h4>
        <p class="text-gray-700">👤 <?php echo is_user_logged_in() ? esc_html( wp_get_current_user()->display_name ) : 'کاربر مهمان'; ?></p>
      </div>
      <div class="bkja-menu-section bkja-categories-section mb-6">
        <h4 class="bkja-menu-title text-base font-semibold text-blue-700 mb-2">دسته‌بندی‌ها</h4>
        <ul id="bkja-categories-list" class="bkja-menu-cats space-y-2" role="list"></ul>
      </div>
      <div class="bkja-menu-section bkja-jobs-section mb-6" style="display:none;">
        <h4 class="bkja-menu-title text-base font-semibold text-blue-700 mb-2">شغل‌ها</h4>
        <ul id="bkja-jobs-list" class="bkja-menu-cats space-y-2" role="list"></ul>
      </div>
      <!-- پنل تاریخچه -->
      <!-- پنل تاریخچه توسط JS ساخته می‌شود -->
    </div>
  </div>

  <div class="bkja-messages flex-1 px-4 py-3 space-y-2 overflow-y-auto" role="log" aria-live="polite">
    <!-- پیام‌های چت توسط JS اضافه می‌شوند -->
    <!-- نمونه استایل برای بابل کاربر و بات -->
    <div class="hidden">
      <div class="bkja-bubble user bg-blue-100 bg-opacity-60 backdrop-blur-lg rounded-xl shadow-md text-right text-blue-900 px-4 py-2 mb-2 w-fit max-w-[80%] ml-auto border border-blue-200">نمونه پیام کاربر</div>
      <div class="bkja-bubble bot bg-white bg-opacity-80 backdrop-blur-lg rounded-xl shadow-md text-right text-gray-800 px-4 py-2 mb-2 w-fit max-w-[80%] mr-auto border border-gray-200">نمونه پیام بات</div>
    </div>
  </div>

  <form id="bkja-chat-form" class="bkja-form px-4 py-3 bg-white/80 border-t border-white/20" action="#" method="post">
    <div class="bkja-quick-list" aria-hidden="false"></div>
    <div class="bkja-input-row">
      <input id="bkja-user-message" name="message" type="text"
        class="flex-1 rounded-xl border border-gray-300 bg-white/60 px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
        placeholder="<?php esc_attr_e( 'پیام خود را بنویسید...', 'bkja-assistant' ); ?>" />
      <button id="bkja-send" type="submit" class="rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 shadow transition"> <?php esc_html_e( 'ارسال', 'bkja-assistant' ); ?> </button>
    </div>
  </form>
</div>
