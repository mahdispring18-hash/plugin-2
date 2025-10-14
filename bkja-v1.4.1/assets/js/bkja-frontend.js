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
        var lastKnownJobTitle = '';
        var lastReplyMeta = {};
        var categoryDisplayNames = {};
        var personalityFlow = {
            active: false,
            awaitingResult: false,
            step: 0,
            jobTitle: '',
            answers: [],
            questions: [
                { id: 'interests', text: 'بیشتر به چه نوع کارها یا فعالیت‌هایی علاقه داری؟' },
                { id: 'environment', text: 'چه محیط کاری (مثلاً کارگاهی، اداری، تیمی یا مستقل) برایت انگیزه‌بخش‌تر است؟' },
                { id: 'skills', text: 'مهم‌ترین مهارت یا نقطه قوتی که در کار داری چیه؟' },
                { id: 'stress', text: 'وقتی با شرایط پرتنش یا غیرقابل‌پیش‌بینی مواجه می‌شی چطور واکنش می‌دی؟' }
            ]
        };

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

        function mapCategoryToHumanName(category){
            if(category === null || category === undefined){
                return '';
            }
            var key = String(category);
            var lookup = key.toLowerCase();
            if(categoryDisplayNames.hasOwnProperty(lookup)){
                return categoryDisplayNames[lookup];
            }
            if(categoryDisplayNames.hasOwnProperty(key)){
                return categoryDisplayNames[key];
            }
            if(lookup === 'generic'){
                return '';
            }
            return key.replace(/[-_]+/g, ' ').trim();
        }

        function cleanJobHint(value){
            if(value === null || value === undefined){
                return '';
            }
            var text = $.trim(String(value));
            if(!text || text === 'این حوزه'){
                return '';
            }
            return text;
        }

        function buildNextStepPrompt(info){
            info = info || {};
            var label = info.jobTitle || mapCategoryToHumanName(info.category) || 'این حوزه';
            return 'به من کمک کن بدانم قدم بعدی منطقی برای تحقیق بیشتر درباره ' + label + ' چیست.';
        }

        function buildQuickActionsForMessage(message){
            var el = message;
            if(message && message.jquery){
                el = message.get(0);
            }
            if(!el){
                return null;
            }
            var dataset = el.dataset || {};
            var cat = dataset.category || el.getAttribute('data-category') || 'generic';
            var job = dataset.jobTitle || el.getAttribute('data-job-title') || '';
            var slug = dataset.jobSlug || el.getAttribute('data-job-slug') || '';

            var wrap = document.createElement('div');
            wrap.className = 'bkja-quick-actions';

            var btnNext = document.createElement('button');
            btnNext.type = 'button';
            btnNext.className = 'bkja-btn-next';
            btnNext.textContent = 'قدم بعدی منطقی';
            btnNext.addEventListener('click', function(){
                var followup = buildNextStepPrompt({ category: cat, jobTitle: job, jobSlug: slug });
                dispatchUserMessage(followup, { category: cat, jobTitle: job, jobSlug: slug });
            });

            wrap.appendChild(btnNext);

            return wrap;
        }

        function applyAssistantMeta($message, meta){
            if(!$message || !$message.length){
                return;
            }
            var data = meta || {};
            var el = $message.get(0);
            if(!el){
                return;
            }
            var categoryValue = data.category ? String(data.category) : '';
            var jobTitleValue = data.job_title ? String(data.job_title) : '';
            var jobSlugValue = data.job_slug ? String(data.job_slug) : '';

            if(el.dataset){
                el.dataset.category = categoryValue;
                el.dataset.jobTitle = jobTitleValue;
                el.dataset.jobSlug = jobSlugValue;
            }
            el.setAttribute('data-category', categoryValue);
            el.setAttribute('data-job-title', jobTitleValue);
            el.setAttribute('data-job-slug', jobSlugValue);

            $message.find('.bkja-quick-actions').remove();
            var actions = buildQuickActionsForMessage(el);
            if(actions && actions.childNodes && actions.childNodes.length){
                $message.append(actions);
            }
        }

        function removeFollowups(){
            $('.bkja-followups').remove();
        }

        function renderFollowups(items, meta){
            removeFollowups();
            if(!Array.isArray(items) || !items.length){
                items = [];
            }
            var unique = [];
            items.forEach(function(item){
                if(item === null || item === undefined) return;
                var text = String(item).trim();
                if(text && unique.indexOf(text) === -1){
                    unique.push(text);
                }
            });
            var metaJob = meta && meta.job_title ? $.trim(meta.job_title) : '';
            if(!unique.length && metaJob){
                var jobFragment = '«' + metaJob + '»';
                unique.push('اگر بخوام بررسی کنم آیا ' + jobFragment + ' برای من مناسبه از کجا شروع کنم؟');
                unique.push('برای موفقیت در ' + jobFragment + ' چه مهارت‌هایی رو باید تقویت کنم؟');
            }
            if(!unique.length){
                return [];
            }
            if(unique.length > 3){
                unique = unique.slice(0,3);
            }
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
            return unique;
        }

        function appendResponseMeta(text){
            if(!text) return;
            var $meta = $('<div class="bkja-response-meta"></div>').html(formatMessage(text));
            $messages.append($meta);
            $messages.scrollTop($messages.prop('scrollHeight'));
        }

        function attachFeedbackControls($bubble, meta, userMessage, responseText, options){
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

            options = options || {};
            var highlight = !!options.highlight;
            var autoOpen = !!options.autoOpen;

            var $wrap = $('<div class="bkja-feedback-wrap"></div>');
            var $cta = $('<button type="button" class="bkja-feedback-cta" aria-expanded="false"></button>');
            $cta.text(highlight ? 'نظرت درباره این پاسخ چیه؟' : 'ثبت بازخورد پاسخ');
            if(highlight){
                $cta.addClass('bkja-feedback-cta-highlight');
            }

            var $controls = $('<div class="bkja-feedback-controls" role="group" aria-label="بازخورد پاسخ" style="display:none;"></div>');
            var $like = $('<button type="button" class="bkja-feedback-btn like" aria-label="پاسخ مفید بود">👍</button>');
            var $dislike = $('<button type="button" class="bkja-feedback-btn dislike" aria-label="پاسخ نیاز به بهبود دارد">👎</button>');
            var $improve = $('<button type="button" class="bkja-feedback-toggle" aria-expanded="false">بهبود این پاسخ</button>');
            var $status = $('<span class="bkja-feedback-status" aria-live="polite"></span>');
            var $extra = $('<div class="bkja-feedback-extra" style="display:none;"></div>');
            var $tags = $('<input type="text" class="bkja-feedback-tags" placeholder="برچسب‌های اختیاری (مثل need_numbers)">');
            var $comment = $('<textarea class="bkja-feedback-comment" placeholder="توضیح اختیاری برای بهبود پاسخ"></textarea>');
            $extra.append($tags).append($comment);

            $controls.append($like).append($dislike).append($improve).append($status);
            $wrap.append($cta).append($controls).append($extra);
            $bubble.after($wrap);
            $bubble.data('bkja-feedback', true);

            var sending = false;
            var controlsVisible = false;

            function openControls(){
                if(controlsVisible){
                    return;
                }
                controlsVisible = true;
                $controls.slideDown(150);
                $cta.attr('aria-expanded','true').addClass('bkja-feedback-cta-open');
                $cta.removeClass('bkja-feedback-cta-highlight');
            }

            $cta.on('click', function(){
                if(sending){ return; }
                if(controlsVisible){
                    return;
                }
                openControls();
            });

            function sendFeedback(vote){
                if(sending){ return; }
                sending = true;
                $status.text('در حال ارسال بازخورد...');

                var bubbleEl = $bubble && $bubble.length ? $bubble.get(0) : null;
                var dataset = bubbleEl && bubbleEl.dataset ? bubbleEl.dataset : {};
                var datasetCategory = dataset && dataset.category ? dataset.category : '';
                var datasetJobTitle = dataset && dataset.jobTitle ? dataset.jobTitle : '';
                var datasetJobSlug = dataset && dataset.jobSlug ? dataset.jobSlug : '';
                if(!datasetCategory && bubbleEl){
                    datasetCategory = bubbleEl.getAttribute('data-category') || '';
                }
                if(!datasetJobTitle && bubbleEl){
                    datasetJobTitle = bubbleEl.getAttribute('data-job-title') || '';
                }
                if(!datasetJobSlug && bubbleEl){
                    datasetJobSlug = bubbleEl.getAttribute('data-job-slug') || '';
                }

                var payload = {
                    action: 'bkja_feedback',
                    nonce: config.nonce,
                    session: sessionId,
                    vote: vote,
                    message: normalizedMessage,
                    response: responseText || '',
                    category: datasetCategory || meta.category || '',
                    model: meta.model || '',
                    job_title: datasetJobTitle || meta.job_title || ''
                };
                if(datasetJobSlug || meta.job_slug){
                    payload.job_slug = datasetJobSlug || meta.job_slug || '';
                }
                if(vote === -1){
                    payload.tags = $.trim($tags.val());
                    payload.comment = $.trim($comment.val());
                }
                var requestBody = new URLSearchParams(payload).toString();
                fetch(config.ajax_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    },
                    body: requestBody
                }).then(function(response){
                    if(!response.ok){
                        throw new Error('Request failed');
                    }
                    return response.json();
                }).then(function(res){
                    sending = false;
                    if(res && res.success){
                        $status.text('بازخورد شما ثبت شد. ممنونیم!');
                        $like.prop('disabled', true);
                        $dislike.prop('disabled', true);
                        $improve.prop('disabled', true);
                        $tags.prop('disabled', true);
                        $comment.prop('disabled', true);
                        $cta.prop('disabled', true).addClass('bkja-feedback-cta-disabled').text('بازخورد ثبت شد ✅');
                    } else {
                        $status.text('خطا در ثبت بازخورد. دوباره تلاش کنید.');
                    }
                }).catch(function(){
                    sending = false;
                    $status.text('خطا در ارتباط با سرور.');
                });
            }

            $like.on('click', function(){
                openControls();
                sendFeedback(1);
            });

            $dislike.on('click', function(){
                openControls();
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

            if(autoOpen){
                setTimeout(function(){ openControls(); }, 80);
            }
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

            function normalizeForMatch(text){
                if(text === null || text === undefined){
                    return '';
                }
                return String(text).replace(/[\s‌]+/g,' ').trim().toLowerCase();
            }

            function shouldStartPersonalityFlow(message){
                if(personalityFlow.active || personalityFlow.awaitingResult){
                    return false;
                }
                var normalized = normalizeForMatch(message);
                if(!normalized){
                    return false;
                }
                if(normalized.indexOf('شخصیت') === -1 && normalized.indexOf('تیپ') === -1 && normalized.indexOf('روحیه') === -1){
                    return false;
                }
                var verbs = ['میخوره','می‌خوره','هماهنگ','سازگار','مناسب','میاد','ارزیابی'];
                var verbFound = false;
                for(var i=0;i<verbs.length;i++){
                    if(normalized.indexOf(verbs[i]) !== -1){
                        verbFound = true;
                        break;
                    }
                }
                if(!verbFound){
                    return false;
                }
                if(normalized.indexOf('شغل') === -1 && normalized.indexOf('کار') === -1 && !lastKnownJobTitle){
                    return false;
                }
                return true;
            }

            function extractJobTitleFromMessage(message){
                if(!message){
                    return lastKnownJobTitle || '';
                }
                var job = '';
                var match = message.match(/شغل\s*(?:«|"|\')?\s*([^»"'؟\?\n]+?)(?:»|"|\'|\s|\?|؟|$)/);
                if(match && match[1]){
                    job = $.trim(match[1]);
                }
                if(!job){
                    match = message.match(/(?:درباره|در مورد|راجع|راجب|خصوص|حوزه)\s+([^\?\!\n]+?)(?:\s*(?:چی|چیه|است|می|؟|\?|$))/);
                    if(match && match[1]){
                        job = $.trim(match[1]);
                    }
                }
                if(!job){
                    job = lastKnownJobTitle || '';
                }
                return job;
            }

            function askNextPersonalityQuestion(){
                if(!personalityFlow.active){
                    return;
                }
                if(personalityFlow.step >= personalityFlow.questions.length){
                    completePersonalityFlow();
                    return;
                }
                var q = personalityFlow.questions[personalityFlow.step];
                pushBot('سوال ' + (personalityFlow.step + 1) + ') ' + q.text);
            }

            function startPersonalityFlow(initialMessage){
                personalityFlow.active = true;
                personalityFlow.awaitingResult = false;
                personalityFlow.answers = [];
                personalityFlow.step = 0;
                personalityFlow.jobTitle = extractJobTitleFromMessage(initialMessage) || 'این شغل';
                if(personalityFlow.jobTitle && personalityFlow.jobTitle !== 'این شغل'){
                    lastKnownJobTitle = personalityFlow.jobTitle;
                }
                var jobFragment = personalityFlow.jobTitle === 'این شغل' ? personalityFlow.jobTitle : 'شغل «' + personalityFlow.jobTitle + '»';
                pushBot('برای اینکه بفهمیم ' + jobFragment + ' با ویژگی‌هات هماهنگ است چند سوال کوتاه ازت می‌پرسم. لطفاً کوتاه و صادقانه جواب بده.', {
                    onComplete: function(){
                        setTimeout(function(){ askNextPersonalityQuestion(); }, 260);
                    }
                });
            }

            function handlePersonalityAnswer(answer){
                if(!personalityFlow.active){
                    return;
                }
                var q = personalityFlow.questions[personalityFlow.step];
                personalityFlow.answers.push({ question: q.text, answer: answer });
                personalityFlow.step += 1;
                if(personalityFlow.step < personalityFlow.questions.length){
                    setTimeout(function(){ askNextPersonalityQuestion(); }, 260);
                } else {
                    completePersonalityFlow();
                }
            }

            function completePersonalityFlow(){
                if(personalityFlow.awaitingResult){
                    return;
                }
                personalityFlow.active = false;
                personalityFlow.awaitingResult = true;
                var job = personalityFlow.jobTitle || lastKnownJobTitle || 'این شغل';
                var jobFragment = job === 'این شغل' ? job : 'شغل «' + job + '»';
                var summary = personalityFlow.answers.map(function(item, idx){
                    return (idx + 1) + '. ' + item.question + ' => ' + item.answer;
                }).join('\n');
                var prompt = 'می‌خوام بررسی کنی آیا ' + jobFragment + ' با شخصیت و ترجیحات من تناسب دارد یا نه.' +
                    '\nپاسخ‌های من به سوالات شخصیت‌شناسی:' + '\n' + summary + '\n' +
                    'لطفاً نتیجه را در سه بخش «تناسب کلی»، «دلایل سازگاری یا عدم سازگاری»، و «پیشنهاد قدم بعدی» ارائه بده و اگر این شغل مناسب نیست چند گزینه جایگزین مرتبط معرفی کن.';
                pushBot('سپاس از پاسخ‌هات! دارم بررسی می‌کنم که این شغل با روحیه‌ات هماهنگ هست یا نه...', {
                    onComplete: function(){
                        removeFollowups();
                        sendMessageToServer(prompt, { contextMessage: prompt, highlightFeedback: true });
                        personalityFlow.answers = [];
                    }
                });
            }

            function dispatchUserMessage(message, options){
                options = options || {};
                var text = message;
                if(text === null || text === undefined){
                    text = '';
                }
                text = $.trim(String(text));
                if(!text){
                    return;
                }

                removeFollowups();
                if(personalityFlow.awaitingResult){
                    personalityFlow.awaitingResult = false;
                }

                pushUser(text);
                $input.val('');

                if(personalityFlow.active){
                    handlePersonalityAnswer(text);
                    return;
                }

                if(shouldStartPersonalityFlow(text)){
                    startPersonalityFlow(text);
                    return;
                }

                var sendOptions = { contextMessage: text };
                if(typeof options.category === 'string' && options.category.length){
                    sendOptions.category = options.category;
                }
                if(options.highlightFeedback){
                    sendOptions.highlightFeedback = true;
                }

                var explicitJobTitle = cleanJobHint(options.jobTitle);
                var fallbackJobTitle = cleanJobHint(lastKnownJobTitle);
                if(explicitJobTitle){
                    sendOptions.jobTitle = explicitJobTitle;
                } else if(fallbackJobTitle){
                    sendOptions.jobTitle = fallbackJobTitle;
                }

                var explicitJobSlug = cleanJobHint(options.jobSlug);
                if(explicitJobSlug){
                    sendOptions.jobSlug = explicitJobSlug;
                } else if(lastReplyMeta && cleanJobHint(lastReplyMeta.job_slug)){
                    sendOptions.jobSlug = cleanJobHint(lastReplyMeta.job_slug);
                }

                sendMessageToServer(text, sendOptions);
            }

            function sendMessageToServer(message, opts){
                opts = opts || {};
                var contextMessage = opts.contextMessage || message;
                var payload = {
                    action: 'bkja_send_message',
                    nonce: config.nonce,
                    message: message,
                    session: sessionId
                };
                if(opts.category){
                    payload.category = opts.category;
                }
                if(cleanJobHint(opts.jobTitle)){
                    payload.job_title = cleanJobHint(opts.jobTitle);
                }
                if(cleanJobHint(opts.jobSlug)){
                    payload.job_slug = cleanJobHint(opts.jobSlug);
                }
                $.post(config.ajax_url, payload, function(res){
                    personalityFlow.awaitingResult = false;
                    if(res && res.success){
                        var reply = res.data.reply || '';
                        var suggestions = Array.isArray(res.data.suggestions) ? res.data.suggestions : [];
                        var fromCache = !!res.data.from_cache;
                        var meta = res.data.meta || {};
                        if(meta.job_title){
                            lastKnownJobTitle = meta.job_title;
                        }
                        lastReplyMeta = meta;
                        pushBot(reply, {
                            onComplete: function($bubble){
                                applyAssistantMeta($bubble, meta);
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
                                var finalSuggestions = renderFollowups(suggestions, meta);
                                var highlightFeedback = !!opts.highlightFeedback || finalSuggestions.length === 0;
                                if(reply && reply.length){
                                    attachFeedbackControls($bubble, meta, contextMessage, reply, { highlight: highlightFeedback });
                                }
                            }
                        });
                    } else if(res && res.error === 'guest_limit'){
                        var loginUrl = (res.login_url || '/wp-login.php');
                        pushBotHtml('<div style="color:#d32f2f;font-weight:700;padding:12px 0;">برای ادامه گفتگو باید عضو سایت شوید.<br> <a href="'+loginUrl+'" style="color:#1976d2;text-decoration:underline;font-weight:700;">ورود یا ثبت‌نام</a></div>');
                    } else {
                        pushBot('خطا در پاسخ');
                    }
                }).fail(function(xhr){
                    personalityFlow.awaitingResult = false;
                    if(xhr && xhr.responseJSON && xhr.responseJSON.error === 'guest_limit'){
                        var res = xhr.responseJSON;
                        pushBotHtml('<div style="color:#d32f2f;font-weight:700;padding:12px 0;">برای ادامه گفتگو باید عضو سایت شوید.<br> <a href="'+(res.login_url||'/wp-login.php')+'" style="color:#1976d2;text-decoration:underline;font-weight:700;">ورود یا ثبت‌نام</a></div>');
                    } else {
                        pushBot('خطا در ارتباط با سرور');
                    }
                });
            }

            $form.on('submit', function(e){
                e.preventDefault();
                var msg = $input.val();
                dispatchUserMessage(msg);
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
                        if(cat.name){
                            if(typeof cat.slug !== 'undefined' && cat.slug !== null){
                                var slugKey = String(cat.slug);
                                categoryDisplayNames[slugKey] = cat.name;
                                categoryDisplayNames[slugKey.toLowerCase()] = cat.name;
                            }
                            if(typeof cat.id !== 'undefined' && cat.id !== null){
                                var idKey = String(cat.id);
                                categoryDisplayNames[idKey] = cat.name;
                            }
                        }
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