/*
Custom JS
==========

Author: Domingo Esteban
Updated: August 2014

*/

/*
$(function() {

  $('#alertMe').click(function(e) {

    e.preventDefault();

    $('#successAlert').slideDown();

  });
}); */


$('.dropdown-toggle').dropdown();


$('.mytooltip').tooltip();


$('[rel="popover"]').popover({
  trigger: 'hover', // click | hover | focus | manual
  html: true,
  delay: 500,
});



// $('.navbar li').click(function(e) {
//     $('.navbar li.active').removeClass('active');
//     var $this = $(this);
//     if (!$this.hasClass('active')) {
//         $this.addClass('active');
//     }
//     e.preventDefault();
// });

jQuery(function () {

/*    $(window).resize(function () {
        if ($(window).height() > 600) {
            var sH = $(window).height();
        } else {
            var sH = 600;
        }
        $('.header-10-sub').css('height', sH + 'px');
    });*/

    $('.show_more').click(function(){
      $(this).next('div.hidden-box').slideDown(800);
      $(this).css('visibility', 'hidden');
       return false;
    });

/*    $(".links a, .nav a").click(function (event) {
        event.preventDefault();
        var dest = 0;
        if ($(this.hash).offset().top > $(document).height() - $(window).height()) {
            dest = $(document).height() - $(window).height();
        } else {
            dest = $(this.hash).offset().top;
        }
        $('html,body').animate({scrollTop: dest}, 800, 'swing');
    });*/

});




/*PARA CV2*/


$('body').scrollspy({ target: '#sidebar', offset:80 });


var clicked = false;
$('#mynav li a').click(
function(){
  $('#mycontent > div > h2').css('padding-top',0);
  $($( this ).attr('href') + ' > h2').css('padding-top','50px');
  clicked = true;
  }
);  

$('body').on('activate.bs.scrollspy', function () {
  console.log('scrolling...');
  if(!clicked)$('#mycontent > div > h2').css('padding-top',0);
  clicked = false;
})

 
$(function(){
  $(document).on( 'scroll', function(){
   
  if ($(window).scrollTop() > 100) {
    $('.scroll-top-wrapper').addClass('show');
    } else {
    $('.scroll-top-wrapper').removeClass('show');
    }
  });
});

$(function(){
  $(document).on( 'scroll', function(){
   
  if ($(window).scrollTop() > 100) {
    $('.scroll-top-wrapper').addClass('show');
  } else {
    $('.scroll-top-wrapper').removeClass('show');
  }
  });
   
  $('.scroll-top-wrapper').on('click', scrollToTop);
});
 
function scrollToTop() {
  verticalOffset = typeof(verticalOffset) != 'undefined' ? verticalOffset : 0;
  element = $('body');
  offset = element.offset();
  offsetTop = offset.top;
  $('html, body').animate({scrollTop: offsetTop}, 500, 'linear');
}


$(window).load(function() {
  /*$(".robotLoader").fadeOut("slow");*/
  $(".robotLoader").fadeOut(1500);
})