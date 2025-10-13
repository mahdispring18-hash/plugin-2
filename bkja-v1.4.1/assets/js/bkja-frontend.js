(function(window, document, $){
    'use strict';
    var config = window.BKJA || window.bkja_vars || {};
    if(!config.ajax_url){
        if(typeof window.ajaxurl !== 'undefined'){
            config.ajax_url = window.ajaxurl;
        } else {
            config.ajax_url = '/wp-admin/admin-ajax.php';
        }
    }
    if(!config.nonce && window.bkja_vars && window.bkja_vars.nonce){
        config.nonce = window.bkja_vars.nonce;
    }
    if(typeof config.is_logged_in === 'undefined'){
        config.is_logged_in = 0;
    }
    if(typeof config.free_limit === 'undefined'){
        config.free_limit = 0;
    }
    function bkja_log(){ try{ console.log.apply(console, ['%cBKJA','color:#fff;background:#0b79d0;padding:2px 6px;border-radius:3px;'].concat(Array.prototype.slice.call(arguments))); }catch(e){} }

    $(function(){
        // chat submit & quick items
        var $form = $('#bkja-chat-form');
        var $input = $('#bkja-user-message');
        var $messages = $('.bkja-messages');

        function getSessionId(){ 
            var s = localStorage.getItem('bkja_session_id'); 
            if(!s){ 
                s = 'guest_' + Math.random().toString(36).substr(2,9); 
                localStorage.setItem('bkja_session_id', s);
            } 
            return s; 
        }
        var sessionId = getSessionId();

        function esc(s){ return $('<div/>').text(s).html(); }
        function formatMessage(text){
            if(text === null || text === undefined){ text = ''; }
            if(typeof text !== 'string'){ text = String(text); }
            return esc(text).replace(/\n/g,'<br>');
        }
        function pushUser(text){
            var $m = $('<div class="bkja-bubble user"></div>').html(formatMessage(text));
            $messages.append($m);
            $messages.scrollTop($messages.prop('scrollHeight'));
        }
        function pushBot(text, opts){
            opts = opts || {};
            if(text === null || text === undefined){ text = ''; }
            if(typeof text !== 'string'){ text = String(text); }
            var $typing = $('<div class="bkja-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>');
            $messages.append($typing);
            $messages.scrollTop($messages.prop('scrollHeight'));
            setTimeout(function(){
                $typing.remove();
                var $m = $('<div class="bkja-bubble bot"></div>');
                var $span = $('<span></span>');
                $m.append($span);
                $messages.append($m);
                $messages.scrollTop($messages.prop('scrollHeight'));
                var i = 0;
                var interval = setInterval(function(){
                    i++;
                    $span.html(formatMessage(text.substring(0,i)));
                    $messages.scrollTop($messages.prop('scrollHeight'));
                    if(i >= text.length){
                        clearInterval(interval);
                        if(typeof opts.onComplete === 'function'){
                            opts.onComplete($m);
                        }
                    }
                }, 18);
            }, 1200);
        }
        function pushBotHtml(html){
            var content = html;
            if(typeof content === 'string' && content.indexOf('<') === -1){
                content = formatMessage(content);
            }
            var $m = $('<div class="bkja-bubble bot"></div>').html(content);
            $messages.append($m);
            $messages.scrollTop($messages.prop('scrollHeight'));
        }

        function removeFollowups(){
            $('.bkja-followups').remove();
        }

        function renderFollowups(items){
            if(!Array.isArray(items) || !items.length) return;
            var unique = [];
            items.forEach(function(item){
                if(item === null || item === undefined) return;
                var text = String(item).trim();
                if(text && unique.indexOf(text) === -1){
                    unique.push(text);
                }
            });
            if(!unique.length) return;
            var $wrap = $('<div class="bkja-followups" role="list"></div>');
            unique.forEach(function(text){
                var $btn = $('<button type="button" class="bkja-followup-btn" role="listitem"></button>');
                $btn.html(formatMessage(text));
                $btn.on('click', function(){
                    removeFollowups();
                    $input.val(text);
                    $input.focus();
                    setTimeout(function(){ $form.trigger('submit'); }, 120);
                });
                $wrap.append($btn);
            });
            $messages.append($wrap);
            $messages.scrollTop($messages.prop('scrollHeight'));
        }

        function appendResponseMeta(text){
            if(!text) return;
            var $meta = $('<div class="bkja-response-meta"></div>').html(formatMessage(text));
            $messages.append($meta);
            $messages.scrollTop($messages.prop('scrollHeight'));
        }

        function attachFeedbackControls($bubble, meta, userMessage, responseText){
            if(!$bubble || !$bubble.length || !config.ajax_url){
                return;
            }
            if($bubble.data('bkja-feedback')){
                return;
            }

            meta = meta || {};
            var normalizedMessage = meta.normalized_message || userMessage || '';
            if(!normalizedMessage){
                return;
            }

            var $wrap = $('<div class="bkja-feedback-wrap"></div>');
            var $controls = $('<div class="bkja-feedback-controls" role="group" aria-label="بازخورد پاسخ"></div>');
            var $like = $('<button type="button" class="bkja-feedback-btn like" aria-label="پاسخ مفید بود">👍</button>');
            var $dislike = $('<button type="button" class="bkja-feedback-btn dislike" aria-label="پاسخ نیاز به بهبود دارد">👎</button>');
            var $improve = $('<button type="button" class="bkja-feedback-toggle" aria-expanded="false">بهبود این پاسخ</button>');
            var $status = $('<span class="bkja-feedback-status" aria-live="polite"></span>');
            var $extra = $('<div class="bkja-feedback-extra" style="display:none;"></div>');
            var $tags = $('<input type="text" class="bkja-feedback-tags" placeholder="برچسب‌های اختیاری (مثل need_numbers)">');
            var $comment = $('<textarea class="bkja-feedback-comment" placeholder="توضیح اختیاری برای بهبود پاسخ"></textarea>');
            $extra.append($tags).append($comment);

            $controls.append($like).append($dislike).append($improve).append($status);
            $wrap.append($controls).append($extra);
            $bubble.after($wrap);
            $bubble.data('bkja-feedback', true);

            var sending = false;

            function sendFeedback(vote){
                if(sending){ return; }
                sending = true;
                $status.text('در حال ارسال بازخورد...');
                var payload = {
                    action: 'bkja_feedback',
                    nonce: config.nonce,
                    session: sessionId,
                    vote: vote,
                    message: normalizedMessage,
                    response: responseText || '',
                    category: meta.category || '',
                    model: meta.model || ''
                };
                if(vote === -1){
                    payload.tags = $.trim($tags.val());
                    payload.comment = $.trim($comment.val());
                }
                $.post(config.ajax_url, payload, function(res){
                    sending = false;
                    if(res && res.success){
                        $status.text('بازخورد شما ثبت شد. ممنونیم!');
                        $like.prop('disabled', true);
                        $dislike.prop('disabled', true);
                        $improve.prop('disabled', true);
                        $tags.prop('disabled', true);
                        $comment.prop('disabled', true);
                    } else {
                        $status.text('خطا در ثبت بازخورد. دوباره تلاش کنید.');
                    }
                }).fail(function(){
                    sending = false;
                    $status.text('خطا در ارتباط با سرور.');
                });
            }

            $like.on('click', function(){
                sendFeedback(1);
            });

            $dislike.on('click', function(){
                if($extra.is(':hidden')){
                    $extra.slideDown(150);
                    $improve.attr('aria-expanded','true');
                }
                sendFeedback(-1);
            });

            $improve.on('click', function(){
                var isOpen = $extra.is(':visible');
                $extra.slideToggle(150);
                $(this).attr('aria-expanded', (!isOpen).toString());
            });
        }

        if($form.length){
            // ensure quick list placeholder
            if($('.bkja-quick-dropdown').length === 0){
                var $dropdownBtn = $('<button type="button" class="bkja-quick-dropdown-btn">سوالات آماده <span class="bkja-quick-arrow">▼</span></button>');
                var $dropdownWrap = $('<div style="position:relative;width:100%"></div>');
                var $dropdown = $('<div class="bkja-quick-dropdown" style="display:none;"></div>');
                $dropdownWrap.append($dropdownBtn).append($dropdown);
                $form.prepend($dropdownWrap);
            }
            const guideMessage = `
👋 سلام! من دستیار هوشمند شغلی هستم. می‌تونم کمکت کنم شغل مناسب شرایطت رو پیدا کنی، درآمد تقریبی هر شغل رو بدونی، یا بفهمی با سرمایه‌ای که داری چه کسب‌وکاری میشه راه انداخت.
امکانات من شامل این بخش‌هاست:
- 📂 دسته‌بندی مشاغل بر اساس نوع و صنعت
- 🔍 فیلتر مشاغل (سرمایه، درآمد، سختی، علاقه‌مندی)
- 📝 ثبت شغل توسط کاربران (برای معرفی تجربه‌های کاری یا فرصت‌های محلی)
- 👤 ثبت مشخصات پروفایل کاربر (سن، علایق، مهارت‌ها) برای پیشنهاد دقیق‌تر
- 🤖 پاسخ‌دهی هوشمند با توجه به تاریخچه گفتگو و ویژگی‌های شخصی شما
برای دسترسی به همه‌ی این قابلیت‌ها می‌تونید از منوی 📂 بالا سمت چپ استفاده کنید و بخش‌های مختلف رو ببینید. فقط کافیه از من سوال بپرسی یا از دکمه‌های آماده استفاده کنی. 😊
`;
            function getLowInvestmentJobs() {
              return "چه شغل‌هایی رو میشه با سرمایه کم (مثلاً زیر ۵۰ میلیون تومان) شروع کرد که سود مناسبی داشته باشه و ریسک پایینی داشته باشه؟";
            }
            function getJobIncomeList() {
              return "می‌تونی لیستی از مشاغل پرطرفدار در ایران رو بهم بدی و حدود درآمد هرکدوم رو هم توضیح بدی؟";
            }
            function compareJobs() {
              return "دو یا چند شغل مثل پزشکی، مهندسی یا برنامه‌نویسی رو از نظر درآمد، آینده شغلی، سختی کار و سرمایه اولیه مقایسه کن.";
            }
            function suggestSmallBusinesses() {
              return "چه کسب‌وکارهای کوچک و کم‌هزینه‌ای میشه در ایران شروع کرد که آینده خوبی داشته باشه و نیاز به سرمایه زیاد نداشته باشه؟";
            }
            function suggestJobsByPersonality() {
              return "با توجه به ویژگی‌های شخصیتی، علاقه‌مندی‌ها و شرایط سنی من، چه شغل‌هایی می‌تونن مناسب من باشن؟";
            }
                        const predefinedQuestions = [
                            { label: "راهنمای دستیار", fullText: guideMessage, icon: "📘" },
                            { label: "شغل با سرمایه کم", fullText: getLowInvestmentJobs(), icon: "💸" },
                            { label: "درآمد شغل‌ها", fullText: getJobIncomeList(), icon: "💰" },
                            { label: "مقایسه شغل‌ها", fullText: compareJobs(), icon: "⚖️" },
                            { label: "کسب‌وکار کوچک", fullText: suggestSmallBusinesses(), icon: "🏪" },
                            { label: "شغل مناسب شخصیت من", fullText: suggestJobsByPersonality(), icon: "🧑‍💼" }
                        ];
                                    var $dropdown = $('.bkja-quick-dropdown').empty();
                                    var grid = $('<div class="bkja-quick-grid"></div>');
                                    predefinedQuestions.forEach(function(q, idx){
                                        var $it = $('<div class="bkja-quick-item"></div>');
                                        var $icon = $('<span class="bkja-quick-icon"></span>').text(q.icon);
                                        var $label = $('<span class="bkja-quick-label"></span>').text(q.label);
                                        $it.append($icon).append($label);
                                        $it.on('click', function(){
                                            $dropdown.slideUp(200);
                                            $('.bkja-quick-dropdown-btn').removeClass('open');
                                            if(idx === 0){
                                                // فقط نمایش راهنما، ارسال به API نشود
                                                removeFollowups();
                                                pushBotHtml(formatMessage(q.fullText));
                                            } else {
                                                $input.val(q.fullText);
                                                $form.trigger('submit');
                                            }
                                        });
                                        grid.append($it);
                                    });
                                    $dropdown.append(grid);
                                    $('.bkja-quick-dropdown-btn').off('click').on('click', function(){
                                        $dropdown.slideToggle(200);
                                        $(this).toggleClass('open');
                                    });

            $form.on('submit', function(e){
                e.preventDefault();
                var msg = $input.val().trim();
                if(!msg) return;
                removeFollowups();
                pushUser(msg);
                $input.val('');
                $.post(config.ajax_url, {
                    action: 'bkja_send_message',
                    nonce: config.nonce,
                    message: msg,
                    session: sessionId
                }, function(res){
                    if(res && res.success){
                        var reply = res.data.reply || '';
                        var suggestions = Array.isArray(res.data.suggestions) ? res.data.suggestions : [];
                        var fromCache = !!res.data.from_cache;
                        var meta = res.data.meta || {};
                        pushBot(reply, {
                            onComplete: function($bubble){
                                if(fromCache){
                                    appendResponseMeta('🔄 این پاسخ از حافظه کش ارائه شد تا سریع‌تر به شما نمایش داده شود.');
                                }
                                if(meta.source === 'database'){
                                    appendResponseMeta('📚 این پاسخ مستقیماً از داده‌های داخلی شغل تهیه شد.');
                                } else if(meta.source === 'job_context'){
                                    appendResponseMeta('ℹ️ به دلیل محدودیت ارتباط با API، پاسخ بر اساس داده‌های داخلی آماده شد.');
                                } else if(meta.context_used && meta.source === 'openai'){
                                    appendResponseMeta('📊 برای این پاسخ از داده‌های داخلی ثبت‌شده استفاده شد.');
                                }
                                attachFeedbackControls($bubble, meta, msg, reply);
                                renderFollowups(suggestions);
                            }
                        });
                    } else if(res && res.error === 'guest_limit'){
                        pushBotHtml('<div style="color:#d32f2f;font-weight:700;padding:12px 0;">برای ادامه گفتگو باید عضو سایت شوید.<br> <a href="'+(res.login_url||'/wp-login.php')+'" style="color:#1976d2;text-decoration:underline;font-weight:700;">ورود یا ثبت‌نام</a></div>');
                    } else {
                        pushBot('خطا در پاسخ');
                    }
                }).fail(function(xhr){
                    if(xhr && xhr.responseJSON && xhr.responseJSON.error === 'guest_limit'){
                        var res = xhr.responseJSON;
                        pushBotHtml('<div style="color:#d32f2f;font-weight:700;padding:12px 0;">برای ادامه گفتگو باید عضو سایت شوید.<br> <a href="'+(res.login_url||'/wp-login.php')+'" style="color:#1976d2;text-decoration:underline;font-weight:700;">ورود یا ثبت‌نام</a></div>');
                    } else {
                        pushBot('خطا در ارتباط با سرور');
                    }
                });
            });
        }

        // === تاریخچه گفتگو ===
        $(document).on("click", "#bkja-open-history", function(){
            var $btn = $(this);
            var $panel = $("#bkja-history-panel");
            var $wrap = $btn.closest(".bkja-menu-panel");
            // حذف هر پنل تاریخچه یا دکمه شناور قبلی
            $(".bkja-history-panel").remove();
            $("#bkja-close-history").remove();
            // اگر پنل وجود ندارد، بساز و اضافه کن
            if ($panel.length === 0) {
                $panel = $('<div id="bkja-history-panel" class="bkja-history-panel"></div>');
                $("#bkja-menu-panel").append($panel);
            }
            $.post(config.ajax_url, {
                action: "bkja_get_history",
                nonce: config.nonce,
                session: sessionId
            }, function(res){
                if(res && res.success){
                    // حذف زیر دسته‌های باز هنگام نمایش تاریخچه
                    $(".bkja-jobs-sublist").remove();
                    $(".bkja-category-item.open").removeClass("open");
                    // ساختار جدید پنل تاریخچه
                    var html = '<div class="bkja-history-title">گفتگوهای شما</div>';
                    html += '<div class="bkja-history-list">';
                    if(res.data.items && res.data.items.length){
                        res.data.items.forEach(function(it){
                            if(it.message){
                                html += '<div class="bkja-history-item user">'+esc(it.message)+'</div>';
                            }
                            if(it.response){
                                html += '<div class="bkja-history-item bot">'+esc(it.response)+'</div>';
                            }
                        });
                    } else {
                        html += '<div>📭 تاریخچه‌ای یافت نشد.</div>';
                    }
                    html += '</div>';
                    html += '<button type="button" id="bkja-close-history" class="bkja-close-menu" style="float:left;">✖ بستن</button>';
                    $panel.html(html).show();
                }
            });
        });
        $(document).on("click","#bkja-close-history",function(){
            $("#bkja-history-panel").remove();
        });

        // === منوی دسته‌ها و شغل‌ها ===
        function loadCategories(){
            $.post(config.ajax_url, {
                action: "bkja_get_categories",
                nonce: config.nonce
            }, function(res){
                if(res && res.success && res.data.categories){
                    var $list = $("#bkja-categories-list").empty();
                    // حذف هر دکمه تاریخچه قبلی
                    $("#bkja-menu-panel #bkja-open-history").remove();
                    // افزودن دکمه گفتگوهای شما بین پروفایل و دسته‌بندی‌ها
                    var $historyBtn = $('<button id="bkja-open-history" type="button" class="bkja-close-menu" style="margin-bottom:12px;width:100%;font-weight:700;font-size:15px;color:#1976d2;background:linear-gradient(90deg,#e6f7ff,#dff3ff);border-radius:10px;border:none;box-shadow:0 1px 4px rgba(30,144,255,0.08);text-align:right;">🕘 گفتگوهای شما</button>');
                    $(".bkja-profile-section").after($historyBtn);
                    res.data.categories.forEach(function(cat){
                        var icon = cat.icon || "💼";
                        var $li = $('<li class="bkja-category-item" data-id="'+cat.id+'"><span class="bkja-cat-icon">'+icon+'</span> <span>'+esc(cat.name)+'</span></li>');
                        $list.append($li);
                    });
                }
            });
        }
        loadCategories();

        // کلیک روی دسته → گرفتن شغل‌ها
        $(document).on("click",".bkja-category-item", function(e){
            e.stopPropagation();
            var $cat = $(this);
            var catId = $cat.data("id");

            if($cat.hasClass("open")){
                $cat.removeClass("open");
                // حذف زیر دسته بعد از li
                $cat.next('.bkja-jobs-sublist').slideUp(200,function(){$(this).remove();});
                return;
            }

            // فقط زیر همین دسته باز شود
            $cat.siblings(".bkja-category-item.open").removeClass("open");
            $cat.siblings(".bkja-category-item").each(function(){
                $(this).next('.bkja-jobs-sublist').remove();
            });

            $cat.addClass("open");
            // زیر دسته دقیقا بعد از li دسته قرار گیرد
            var $sublist = $('<div class="bkja-jobs-sublist">⏳ در حال بارگذاری...</div>');
            // اگر قبلا وجود دارد حذف شود
            $cat.next('.bkja-jobs-sublist').remove();
            // بعد از li اضافه شود
            $cat.after($sublist);

            $.post(config.ajax_url,{
                action:"bkja_get_jobs",
                nonce:config.nonce,
                category_id:catId
            },function(res){
                var $sub = $cat.next('.bkja-jobs-sublist').empty();
                if(res && res.success && res.data.jobs && res.data.jobs.length){
                    res.data.jobs.forEach(function(job){
                        var $j = $('<div class="bkja-job-item" data-id="'+job.id+'">💼 '+esc(job.job_title || job.title)+'</div>');
                        $sub.append($j);
                    });
                } else {
                    $sub.append('<div>❌ شغلی یافت نشد.</div>');
                }
            });
        });

        // کلیک روی شغل → نمایش خلاصه و رکوردهای شغل
        $(document).on("click", ".bkja-job-item", function(e){
            e.stopPropagation();
            var jobTitle = $(this).text().replace('💼','').trim();
            $messages.append('<div class="bkja-bubble user">ℹ️ درخواست اطلاعات شغل '+esc(jobTitle)+'</div>');
            $messages.scrollTop($messages.prop("scrollHeight"));
            showJobSummaryAndRecords(jobTitle);
            $(".bkja-jobs-sublist").slideUp(200,function(){$(this).remove();});
            $(".bkja-category-item.open").removeClass("open");
            $("#bkja-menu-panel").removeClass("bkja-open");
            $("#bkja-menu-toggle").attr("aria-expanded","false");
        });

        // نمایش خلاصه و رکوردهای شغل با دکمه نمایش بیشتر
        function showJobSummaryAndRecords(job_title) {
            // دریافت خلاصه و اولین سری رکوردها با هم
            $.when(
                $.post(config.ajax_url, {
                    action: "bkja_get_job_summary",
                    nonce: config.nonce,
                    job_title: job_title
                }),
                $.post(config.ajax_url, {
                    action: "bkja_get_job_records",
                    nonce: config.nonce,
                    job_title: job_title,
                    limit: 5,
                    offset: 0
                })
            ).done(function(summaryRes, recordsRes) {
                var s = summaryRes[0] && summaryRes[0].success && summaryRes[0].data && summaryRes[0].data.summary ? summaryRes[0].data.summary : null;
                var records = recordsRes[0] && recordsRes[0].success && recordsRes[0].data && recordsRes[0].data.records ? recordsRes[0].data.records : [];
                var totalCount = recordsRes[0] && recordsRes[0].success && recordsRes[0].data && typeof recordsRes[0].data.total_count !== 'undefined' ? recordsRes[0].data.total_count : records.length;
                var html = '<div class="bkja-job-summary-card">';
                html += '<div class="bkja-job-summary-header">';
                if (s) {
                    html += '<h4>💼 ' + esc(s.job_title) + '</h4>';
                    html += '<div class="bkja-job-summary-meta">';
                    html += '<span>🔢 تعداد تجربه‌های ثبت‌شده: ' + esc(records.length) + '</span>';
                    html += '</div>';
                } else {
                    html += '<div>❌ خلاصه‌ای برای این شغل یافت نشد.</div>';
                }
                html += '</div>';
                // توضیح را بعد از هدر و متا نمایش بده
                if (s) {
                    html += '<div class="bkja-job-summary-note">این اطلاعات میانگین و جمع‌بندی تجربه‌های واقعی کاربران این شغل است و شهرها، مزایا و معایب بر اساس تجربه‌های ارسالی کاربران نمایش داده می‌شود.</div>';
                }
                if (s && s.income) html += '<p>💵 میانگین درآمد اعلام‌شده توسط کاربران: ' + esc(s.income) + '</p>';
                if (s && s.investment) html += '<p>💰 میانگین سرمایه موردنیاز از دید کاربران: ' + esc(s.investment) + '</p>';
                if (s && s.cities) html += '<p>📍 شهرها (بر اساس تجربه کاربران): ' + esc(s.cities) + '</p>';
                if (s && s.genders) html += '<p>👤 مناسب برای: ' + esc(s.genders) + '</p>';
                if (s && s.advantages) html += '<p>⭐ مزایا (بر اساس گفته‌های کاربران): ' + esc(s.advantages) + '</p>';
                if (s && s.disadvantages) html += '<p>⚠️ معایب (بر اساس گفته‌های کاربران): ' + esc(s.disadvantages) + '</p>';
                html += '</div>';
                pushBotHtml(html);
                // نمایش رکوردهای کاربران
                if(records && records.length){
                    records.forEach(function(r){
                        var recHtml = '<div class="bkja-job-record-card">';
                        recHtml += '<h5>🧑‍💼 تجربه کاربر</h5>';
                        if (r.income) recHtml += '<p>💵 درآمد: ' + esc(r.income) + '</p>';
                        if (r.investment) recHtml += '<p>💰 سرمایه: ' + esc(r.investment) + '</p>';
                        if (r.city) recHtml += '<p>📍 شهر: ' + esc(r.city) + '</p>';
                        if (r.gender) recHtml += '<p>👤 جنسیت: ' + esc(r.gender) + '</p>';
                        if (r.advantages) recHtml += '<p>⭐ مزایا: ' + esc(r.advantages) + '</p>';
                        if (r.disadvantages) recHtml += '<p>⚠️ معایب: ' + esc(r.disadvantages) + '</p>';
                        if (r.details) recHtml += '<p>📝 توضیحات: ' + esc(r.details) + '</p>';
                        if (r.created_at) recHtml += '<p class="bkja-job-date">تاریخ ثبت: ' + esc(r.created_at) + '</p>';
                        recHtml += '</div>';
                        pushBotHtml(recHtml);
                    });
                    // اگر رکورد بیشتری وجود دارد دکمه نمایش بیشتر اضافه شود
                    if(records.length === 5){
                        var moreBtn = '<button class="bkja-show-records-btn" data-title="'+esc(job_title)+'" data-offset="5">نمایش بیشتر تجربه کاربران</button>';
                        pushBotHtml(moreBtn);
                    }
                } else {
                    pushBotHtml('<div>📭 تجربه‌ای برای این شغل ثبت نشده است.</div>');
                }
            });
        }

        // هندل کلیک روی دکمه نمایش رکوردها
        $(document).on('click', '.bkja-show-records-btn', function() {
            var job_title = $(this).data('title');
            var offset = parseInt($(this).data('offset')) || 0;
            var limit = 5;
            var $btn = $(this);
            $btn.prop('disabled', true).text('⏳ در حال دریافت...');
            $.post(config.ajax_url, {
                action: "bkja_get_job_records",
                nonce: config.nonce,
                job_title: job_title,
                limit: limit,
                offset: offset
            }, function(res) {
                $btn.prop('disabled', false).text('مشاهده تجربه کاربران این شغل');
                if (res && res.success && res.data && res.data.records && res.data.records.length) {
                    res.data.records.forEach(function(r) {
                        var html = '<div class="bkja-job-record-card">';
                        html += '<h5>🧑‍💼 تجربه کاربر</h5>';
                        if (r.income) html += '<p>� درآمد: ' + esc(r.income) + '</p>';
                        if (r.investment) html += '<p>💰 سرمایه: ' + esc(r.investment) + '</p>';
                        if (r.city) html += '<p>📍 شهر: ' + esc(r.city) + '</p>';
                        if (r.gender) html += '<p>👤 جنسیت: ' + esc(r.gender) + '</p>';
                        if (r.advantages) html += '<p>⭐ مزایا: ' + esc(r.advantages) + '</p>';
                        if (r.disadvantages) html += '<p>⚠️ معایب: ' + esc(r.disadvantages) + '</p>';
                        if (r.details) html += '<p>📝 توضیحات: ' + esc(r.details) + '</p>';
                        if (r.created_at) html += '<p class="bkja-job-date">تاریخ ثبت: ' + esc(r.created_at) + '</p>';
                        html += '</div>';
                        pushBotHtml(html);
                    });
                    // اگر رکورد بیشتری وجود دارد دکمه نمایش بیشتر اضافه شود
                    if (res.data.records.length === limit) {
                        var nextOffset = offset + limit;
                        var moreBtn = '<button class="bkja-show-records-btn" data-title="'+esc(job_title)+'" data-offset="'+nextOffset+'">نمایش بیشتر تجربه کاربران</button>';
                        pushBotHtml(moreBtn);
                    }
                    $btn.remove();
                } else {
                    pushBotHtml('<div>📭 تجربه بیشتری برای این شغل ثبت نشده است.</div>');
                    $btn.remove();
                }
            });
        });

        // menu handlers (باز و بسته کردن پنل)
        if(!window.BKJA_MENU_READY){
            window.BKJA_MENU_READY = true;
            var containers = document.querySelectorAll('#bkja-chatbox, .bkja-container');
            containers.forEach(function(container){
                var btn = container.querySelector('#bkja-menu-toggle, .bkja-menu-toggle');
                var panel = container.querySelector('#bkja-menu-panel, .bkja-menu-panel');
                var closeBtn = panel ? panel.querySelector('.bkja-close-menu') : null;
                if(!btn || !panel) return;
                btn.addEventListener('click', function(e){ 
                    e.stopPropagation(); 
                    panel.classList.add('bkja-open'); 
                    btn.setAttribute('aria-expanded','true'); 
                    // حذف مخفی‌سازی چت باکس هنگام باز شدن منو
                });
                if(closeBtn) closeBtn.addEventListener('click', function(e){ e.preventDefault(); panel.classList.remove('bkja-open'); btn.setAttribute('aria-expanded','false'); });
                document.addEventListener('click', function(e){
                    if(!panel.classList.contains('bkja-open')) return;
                    if(panel.contains(e.target) || btn.contains(e.target)) return;
                    panel.classList.remove('bkja-open');
                    btn.setAttribute('aria-expanded','false');
                });
            });
        }

        // Crisp-style Chat Launcher JS
        (function(window, document, $){
          $(function(){
            var $launcher = $('#bkja-chat-launcher');
            var $launcherBtn = $('#bkja-launcher-btn');
            var $welcome = $('#bkja-launcher-welcome');
            var $chatPanel = $('#bkja-chatbox');
            var $closePanel = $('#bkja-close-panel');
            var $messages = $('.bkja-messages');
            var welcomeMsg = 'سلام 👋 من دستیار شغلی هستم. چطور می‌تونم کمکتون کنم؟';
            var firstBotMsg = welcomeMsg;
            // Crisp-style launcher: show immediately
            $launcher.css({position:'fixed',bottom:'32px',right:'32px',zIndex:99999, pointerEvents:'auto'});
            // Welcome widget: show after short delay (200ms)
            $welcome.css({position:'fixed',bottom:'100px',right:'40px',zIndex:99999, pointerEvents:'auto'});
            setTimeout(function(){
                $welcome.addClass('bkja-show');
            }, 200);
            // هندل کلیک و تاچ برای موبایل و دسکتاپ
            $welcome.on('click touchstart', function(e){
                e.preventDefault();
                $chatPanel.removeClass('bkja-panel-hidden').addClass('bkja-panel-visible');
                $launcher.fadeOut(300);
                if ($messages.find('.bkja-bubble.bot').length === 0) {
                    pushBot(firstBotMsg);
                }
            });
            $launcherBtn.on('click touchstart', function(e){
                e.preventDefault();
                $chatPanel.removeClass('bkja-panel-hidden').addClass('bkja-panel-visible');
                $launcher.fadeOut(300);
                if ($messages.find('.bkja-bubble.bot').length === 0) {
                    pushBot(firstBotMsg);
                }
            });
            // دکمه بستن چت باکس
            $closePanel.on('click touchstart', function(e){
                e.preventDefault();
                $chatPanel.removeClass('bkja-panel-visible').addClass('bkja-panel-hidden');
                $launcher.fadeIn(300);
                $welcome.removeClass('bkja-show');
                setTimeout(function(){ $welcome.addClass('bkja-show'); }, 200);
            });
            // کلیک بیرون چت باکس
            $(document).on('mousedown touchstart', function(e){
                if($chatPanel.hasClass('bkja-panel-visible')){
                    if(!$(e.target).closest('#bkja-chatbox').length && !$(e.target).closest('#bkja-chat-launcher').length && !$(e.target).closest('#bkja-launcher-welcome').length){
                        $chatPanel.removeClass('bkja-panel-visible').addClass('bkja-panel-hidden');
                        $launcher.fadeIn(300);
                        $welcome.removeClass('bkja-show');
                        setTimeout(function(){ $welcome.addClass('bkja-show'); }, 200);
                    }
                }
            });
          });
        })(window, document, jQuery);

    });

})(window, document, jQuery);